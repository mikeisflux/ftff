// E2E for offline door scanning (§8): manifest download + batch check-in sync,
// including single-use atomicity and conflict reporting when a ticket was
// already checked in (e.g. by another device / online).
import assert from 'node:assert';
import argon2 from 'argon2';
import { pool } from '../src/db/pool.js';
import { randomToken } from '../src/lib/crypto.js';

const BASE = process.env.BASE || 'http://localhost:4000/api/v1';
function jarFrom(res, jar = {}) { for (const c of res.headers.getSetCookie?.() || []) { const [p] = c.split(';'); const i = p.indexOf('='); jar[p.slice(0, i)] = p.slice(i + 1); } return jar; }
const cookie = (j) => Object.entries(j).map(([k, v]) => `${k}=${v}`).join('; ');

async function issueTicket() {
  const tt = (await pool.query(`SELECT id FROM ticket_types WHERE code='saturday'`)).rows[0];
  const order = (await pool.query(`INSERT INTO orders (order_number, kind, total_cents, status) VALUES ($1,'ticket',4000,'paid') RETURNING id`, [`FX-OFF-${randomToken(2).toUpperCase()}`])).rows[0];
  const token = randomToken(24);
  await pool.query(`INSERT INTO tickets (order_id, ticket_type_id, attendee_name, qr_token) VALUES ($1,$2,'Offline',$3)`, [order.id, tt.id, token]);
  return token;
}

async function main() {
  const hash = await argon2.hash('doorpass12345', { type: argon2.argon2id });
  await pool.query(`INSERT INTO users (email,name,role,password_hash,is_active) VALUES ('offdoor@test.local','D','door_staff',$1,TRUE) ON CONFLICT (email) DO UPDATE SET password_hash=EXCLUDED.password_hash, role='door_staff', is_active=TRUE`, [hash]);
  const lr = await fetch(`${BASE}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'offdoor@test.local', password: 'doorpass12345' }) });
  const jar = jarFrom(lr);
  const H = { 'Content-Type': 'application/json', Cookie: cookie(jar), 'X-CSRF-Token': jar.csrf_token };

  const tA = await issueTicket();
  const tB = await issueTicket();

  // Manifest includes our fresh valid tickets.
  const manifest = await (await fetch(`${BASE}/validate/manifest`, { headers: { Cookie: cookie(jar) } })).json();
  assert.ok(manifest.generatedAt, 'manifest has timestamp');
  const tokens = new Set(manifest.tickets.map((t) => t.qr_token));
  assert.ok(tokens.has(tA) && tokens.has(tB), 'manifest contains issued tickets for offline cache');
  console.log('  ✓ manifest download for offline cache');

  // Simulate a conflict: tB gets checked in online first.
  await fetch(`${BASE}/validate`, { method: 'POST', headers: H, body: JSON.stringify({ qr_token: tB }) });

  // Batch sync two queued offline check-ins (tA new, tB conflict) with scan times.
  const at = new Date(Date.now() - 60_000).toISOString();
  const batch = await (await fetch(`${BASE}/validate/batch`, {
    method: 'POST', headers: H,
    body: JSON.stringify({ checkins: [{ qr_token: tA, at }, { qr_token: tB, at }] }),
  })).json();
  const byTok = Object.fromEntries(batch.results.map((r) => [r.qr_token, r]));
  assert.equal(byTok[tA].result, 'checked_in', 'queued offline check-in applied');
  assert.equal(byTok[tB].result, 'already_checked_in', 'conflict reported (checked in elsewhere)');
  console.log('  ✓ batch sync applies new check-ins + reports conflicts');

  // The offline scan time was preserved for tA.
  const saved = (await pool.query(`SELECT checked_in_at FROM tickets WHERE qr_token=$1`, [tA])).rows[0];
  assert.equal(new Date(saved.checked_in_at).toISOString(), at, 'offline scan time preserved');
  console.log('  ✓ offline scan timestamp preserved on sync');

  // Re-syncing the same token is idempotent (single-use) -> already_checked_in.
  const again = await (await fetch(`${BASE}/validate/batch`, { method: 'POST', headers: H, body: JSON.stringify({ checkins: [{ qr_token: tA }] }) })).json();
  assert.equal(again.results[0].result, 'already_checked_in', 're-sync is idempotent');
  console.log('  ✓ re-sync idempotent (single-use)');

  console.log('\nALL OFFLINE-SCAN ASSERTIONS PASSED');
  await pool.end();
}

main().catch((e) => { console.error('TEST FAILED:', e.message); process.exit(1); });
