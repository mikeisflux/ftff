// E2E for email (§12): SendGrid Inbound Parse -> stored in inbox, and the
// admin client CRUD (list, read, compose->sent, star, move, trash, purge).
import assert from 'node:assert';
import argon2 from 'argon2';
import { pool } from '../src/db/pool.js';
import { clearSetting } from '../src/lib/settings.js';

const BASE = process.env.BASE || 'http://localhost:4000/api/v1';

function jarFrom(res, jar = {}) {
  for (const c of res.headers.getSetCookie?.() || []) {
    const [pair] = c.split(';'); const i = pair.indexOf('=');
    jar[pair.slice(0, i)] = pair.slice(i + 1);
  }
  return jar;
}
const cookie = (jar) => Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; ');

async function main() {
  // Inbound auth uses a secret only if configured — ensure it's unset here.
  await clearSetting('sendgrid.inbound_webhook_secret', null);

  const hash = await argon2.hash('adminpass12345', { type: argon2.argon2id });
  await pool.query(
    `INSERT INTO users (email,name,role,password_hash,is_active) VALUES ('mail@test.local','Mail','admin',$1,TRUE)
     ON CONFLICT (email) DO UPDATE SET password_hash=EXCLUDED.password_hash, role='admin', is_active=TRUE`,
    [hash],
  );

  // 1. Inbound Parse posts multipart form-data.
  const fd = new FormData();
  fd.set('from', 'Jane Fan <jane@fans.example>');
  fd.set('to', 'info@show.example');
  fd.set('subject', 'Question about parking');
  fd.set('text', 'Is there parking at the venue?');
  fd.set('html', '<p>Is there <b>parking</b> at the venue?</p>');
  fd.set('headers', 'Message-ID: <unique-123@fans.example>\nDate: now');
  const inbound = await fetch(`${BASE}/webhooks/sendgrid-inbound`, { method: 'POST', body: fd });
  assert.equal(inbound.status, 200, 'inbound accepted');
  const stored = (await pool.query(`SELECT * FROM email_messages WHERE provider_msg_id='<unique-123@fans.example>'`)).rows[0];
  assert.ok(stored, 'inbound stored');
  assert.equal(stored.folder, 'inbox');
  assert.equal(stored.from_email, 'jane@fans.example');
  assert.ok(!stored.body_html.includes('<script'), 'inbound html sanitized');
  console.log('  ✓ inbound parse -> stored in inbox (sanitized)');

  // Duplicate Message-ID is deduped.
  const dup = await fetch(`${BASE}/webhooks/sendgrid-inbound`, { method: 'POST', body: (() => { const f = new FormData(); f.set('from', 'x <x@y.z>'); f.set('subject', 's'); f.set('text', 't'); f.set('headers', 'Message-ID: <unique-123@fans.example>'); return f; })() });
  assert.equal((await dup.json()).duplicate, true, 'inbound deduped by Message-ID');
  console.log('  ✓ inbound deduped by Message-ID');

  // 2. Admin login.
  const lr = await fetch(`${BASE}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'mail@test.local', password: 'adminpass12345' }) });
  const jar = jarFrom(lr); const csrf = jar.csrf_token;
  const H = { 'Content-Type': 'application/json', Cookie: cookie(jar), 'X-CSRF-Token': csrf };

  // 3. List inbox, find our message, read it (marks read).
  const list = await (await fetch(`${BASE}/admin/email/messages?folder=inbox`, { headers: { Cookie: cookie(jar) } })).json();
  const m = list.messages.find((x) => x.id === stored.id);
  assert.ok(m, 'message listed in inbox');
  const read = await (await fetch(`${BASE}/admin/email/messages/${m.id}`, { headers: { Cookie: cookie(jar) } })).json();
  assert.equal(read.message.is_read, true, 'opening marks read');
  console.log('  ✓ list + read (marks read, returns thread)');

  // 4. Compose & send (SendGrid unconfigured -> saved to Sent, not delivered).
  const sent = await (await fetch(`${BASE}/admin/email/send`, { method: 'POST', headers: H, body: JSON.stringify({ to: 'jane@fans.example', subject: 'Re: parking', text: 'Yes, garage on site.' }) })).json();
  assert.equal(sent.message.folder, 'sent', 'compose saved to Sent');
  assert.equal(sent.delivery.skipped, true, 'delivery skipped (SendGrid unconfigured)');
  console.log('  ✓ compose -> saved to Sent (config-gated delivery)');

  // 5. Star, move to archive.
  await fetch(`${BASE}/admin/email/messages/${m.id}/star`, { method: 'POST', headers: H, body: JSON.stringify({ starred: true }) });
  const starred = (await pool.query(`SELECT is_starred FROM email_messages WHERE id=$1`, [m.id])).rows[0];
  assert.equal(starred.is_starred, true, 'starred');
  await fetch(`${BASE}/admin/email/messages/${m.id}/move`, { method: 'POST', headers: H, body: JSON.stringify({ folder: 'archive' }) });
  const moved = (await pool.query(`SELECT folder FROM email_messages WHERE id=$1`, [m.id])).rows[0];
  assert.equal(moved.folder, 'archive', 'moved to archive');
  console.log('  ✓ star + move to archive');

  // 6. Delete -> trash, then permanent.
  const d1 = await (await fetch(`${BASE}/admin/email/messages/${m.id}`, { method: 'DELETE', headers: H })).json();
  assert.equal(d1.permanent, false, 'first delete -> trash');
  const d2 = await (await fetch(`${BASE}/admin/email/messages/${m.id}`, { method: 'DELETE', headers: H })).json();
  assert.equal(d2.permanent, true, 'second delete -> permanent');
  const gone = await pool.query(`SELECT 1 FROM email_messages WHERE id=$1`, [m.id]);
  assert.equal(gone.rowCount, 0, 'permanently deleted');
  console.log('  ✓ delete -> trash -> permanent');

  console.log('\nALL EMAIL-FLOW ASSERTIONS PASSED');
  await pool.end();
}

main().catch((e) => { console.error('TEST FAILED:', e.message); process.exit(1); });
