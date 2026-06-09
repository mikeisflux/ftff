// E2E for admin §13: users/roles (with last-admin protection), audit log,
// submissions inbox.
import assert from 'node:assert';
import argon2 from 'argon2';
import { pool } from '../src/db/pool.js';

const BASE = process.env.BASE || 'http://localhost:4000/api/v1';
function jarFrom(res, jar = {}) {
  for (const c of res.headers.getSetCookie?.() || []) { const [p] = c.split(';'); const i = p.indexOf('='); jar[p.slice(0, i)] = p.slice(i + 1); }
  return jar;
}
const cookie = (jar) => Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; ');

async function main() {
  // Ensure a clean single-admin scenario is avoided by using a dedicated admin.
  const hash = await argon2.hash('adminpass12345', { type: argon2.argon2id });
  await pool.query(
    `INSERT INTO users (email,name,role,password_hash,is_active) VALUES ('boss@test.local','Boss','admin',$1,TRUE)
     ON CONFLICT (email) DO UPDATE SET password_hash=EXCLUDED.password_hash, role='admin', is_active=TRUE`,
    [hash],
  );
  const lr = await fetch(`${BASE}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'boss@test.local', password: 'adminpass12345' }) });
  const jar = jarFrom(lr); const H = { 'Content-Type': 'application/json', Cookie: cookie(jar), 'X-CSRF-Token': jar.csrf_token };

  // Create an editor.
  const created = await (await fetch(`${BASE}/admin/users`, { method: 'POST', headers: H, body: JSON.stringify({ email: `ed-${Date.now()}@test.local`, name: 'Ed', role: 'editor', password: 'editorpass123' }) })).json();
  assert.ok(created.user?.id, 'user created');
  console.log('  ✓ create user');

  // Promote then update role.
  await fetch(`${BASE}/admin/users/${created.user.id}`, { method: 'PUT', headers: H, body: JSON.stringify({ role: 'door_staff' }) });
  const after = (await pool.query(`SELECT role FROM users WHERE id=$1`, [created.user.id])).rows[0];
  assert.equal(after.role, 'door_staff', 'role updated');
  console.log('  ✓ update role');

  // Last-admin protection: try to demote ALL admins. First demote every other
  // admin, then attempt to demote boss -> must fail.
  await pool.query(`UPDATE users SET is_active=FALSE WHERE role='admin' AND email <> 'boss@test.local'`);
  const demote = await fetch(`${BASE}/admin/users/${(await pool.query(`SELECT id FROM users WHERE email='boss@test.local'`)).rows[0].id}`, { method: 'PUT', headers: H, body: JSON.stringify({ role: 'editor' }) });
  assert.equal(demote.status, 400, 'last admin demotion blocked');
  console.log('  ✓ last-admin protection blocks self-demotion');
  await pool.query(`UPDATE users SET is_active=TRUE WHERE role='admin'`); // restore

  // Audit log reflects the user.create.
  const audit = await (await fetch(`${BASE}/admin/audit?action=user.create`, { headers: { Cookie: cookie(jar) } })).json();
  assert.ok(audit.entries.length >= 1, 'audit has user.create');
  assert.ok(audit.entries[0].actor_email, 'audit shows actor');
  console.log('  ✓ audit log viewer (actor + action)');

  // Submissions: create one via the public form, then list it.
  await fetch(`${BASE}/contact`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Pat', email: 'pat@x.com', message: 'Hi there team' }) });
  const subs = await (await fetch(`${BASE}/admin/submissions?kind=contact`, { headers: { Cookie: cookie(jar) } })).json();
  assert.ok(subs.submissions.some((s) => s.email === 'pat@x.com'), 'submission listed');
  console.log('  ✓ submissions inbox lists contact form');

  console.log('\nALL ADMIN-FLOW ASSERTIONS PASSED');
  await pool.end();
}

main().catch((e) => { console.error('TEST FAILED:', e.message); process.exit(1); });
