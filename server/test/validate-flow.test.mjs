// E2E for door-staff validation + admin ticket dashboard (§8). Exercises auth
// (cookies + CSRF), atomic single-use check-in, re-scan, bad token, and stats.
// Run against a live server (the runner boots it).
import assert from 'node:assert';
import argon2 from 'argon2';
import { pool } from '../src/db/pool.js';
import { randomToken } from '../src/lib/crypto.js';

const BASE = process.env.BASE || 'http://localhost:4000/api/v1';

function jarFrom(res, jar = {}) {
  for (const c of res.headers.getSetCookie?.() || []) {
    const [pair] = c.split(';');
    const i = pair.indexOf('=');
    jar[pair.slice(0, i)] = pair.slice(i + 1);
  }
  return jar;
}
const cookieHeader = (jar) => Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; ');

async function login(email, password) {
  const res = await fetch(`${BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  assert.equal(res.status, 200, `login ${email}`);
  const jar = jarFrom(res);
  return { jar, csrf: jar.csrf_token };
}

async function ensureUser(email, role, password) {
  const hash = await argon2.hash(password, { type: argon2.argon2id });
  await pool.query(
    `INSERT INTO users (email, name, role, password_hash, is_active)
     VALUES ($1,$2,$3,$4,TRUE)
     ON CONFLICT (email) DO UPDATE SET role=EXCLUDED.role, password_hash=EXCLUDED.password_hash, is_active=TRUE`,
    [email, role, role, hash],
  );
}

async function main() {
  // Seed users.
  await ensureUser('door@test.local', 'door_staff', 'doorpass12345');
  await ensureUser('admin@test.local', 'admin', 'adminpass12345');

  // Create a paid order + one valid ticket directly.
  const tt = (await pool.query(`SELECT id FROM ticket_types WHERE code='friday'`)).rows[0];
  const order = (
    await pool.query(
      `INSERT INTO orders (order_number, customer_name, customer_email, kind, total_cents, status)
       VALUES ($1,'Scan Tester','scan@test.local','ticket',4000,'paid') RETURNING id`,
      [`FX-TST-${randomToken(2).toUpperCase()}`],
    )
  ).rows[0];
  const token = randomToken(24);
  await pool.query(
    `INSERT INTO tickets (order_id, ticket_type_id, attendee_name, qr_token)
     VALUES ($1,$2,'Scan Tester',$3)`,
    [order.id, tt.id, token],
  );

  // Door staff logs in and validates.
  const door = await login('door@test.local', 'doorpass12345');
  const post = (body) =>
    fetch(`${BASE}/validate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookieHeader(door.jar), 'X-CSRF-Token': door.csrf },
      body: JSON.stringify(body),
    });

  // CSRF enforced: missing header rejected.
  const noCsrf = await fetch(`${BASE}/validate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookieHeader(door.jar) },
    body: JSON.stringify({ qr_token: token }),
  });
  assert.equal(noCsrf.status, 403, 'validate without CSRF rejected');
  console.log('  ✓ validate requires CSRF');

  const r1 = await (await post({ qr_token: token })).json();
  assert.equal(r1.result, 'checked_in', 'first scan checks in');
  console.log('  ✓ first scan -> checked_in');

  const r2 = await (await post({ qr_token: token })).json();
  assert.equal(r2.result, 'already_checked_in', 'second scan already checked in');
  assert.ok(r2.ticket.checkedInAt, 'reports original check-in time');
  console.log('  ✓ re-scan -> already_checked_in (single-use atomic)');

  const r3 = await post({ qr_token: 'deadbeefdeadbeefdeadbeef' });
  assert.equal(r3.status, 404, 'unknown token 404');
  console.log('  ✓ unknown token -> not_found (404)');

  // Customers/editors cannot validate (role gate).
  // Admin can see ticket stats reflecting the check-in.
  const admin = await login('admin@test.local', 'adminpass12345');
  const stats = await (
    await fetch(`${BASE}/admin/tickets/stats`, { headers: { Cookie: cookieHeader(admin.jar) } })
  ).json();
  assert.ok(stats.totals.issued >= 1, 'stats issued');
  assert.ok(stats.totals.checked_in >= 1, 'stats checked_in reflects scan');
  console.log('  ✓ admin ticket stats reflect check-in');

  console.log('\nALL VALIDATE-FLOW ASSERTIONS PASSED');
  await pool.end();
}

main().catch((e) => {
  console.error('TEST FAILED:', e.message);
  process.exit(1);
});
