// E2E for the LIVE / Virtual Con gate (§11): Digital holders unlock with their
// confirmation (order) number + email. Wrong email, no-digital orders, and
// unpaid orders are rejected. VOD requires a valid entitlement token.
import assert from 'node:assert';
import { pool } from '../src/db/pool.js';
import { randomToken } from '../src/lib/crypto.js';

const BASE = process.env.BASE || 'http://localhost:4000/api/v1';
const post = (body) =>
  fetch(`${BASE}/virtual/playback-token`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

async function makeOrder({ digital, status = 'paid', email }) {
  const code = digital ? 'digital' : 'friday';
  const tt = (await pool.query(`SELECT id FROM ticket_types WHERE code=$1`, [code])).rows[0];
  const num = `FFF-VC-${randomToken(2).toUpperCase()}`;
  const order = (
    await pool.query(
      `INSERT INTO orders (order_number, customer_email, kind, total_cents, status)
       VALUES ($1,$2,'ticket',1000,$3) RETURNING id`,
      [num, email, status],
    )
  ).rows[0];
  await pool.query(
    `INSERT INTO order_items (order_id, kind, ticket_type_id, description, unit_price_cents, quantity)
     VALUES ($1,'ticket',$2,'t',1000,1)`,
    [order.id, tt.id],
  );
  return num;
}

async function main() {
  const email = 'viewer@test.local';
  const num = await makeOrder({ digital: true, email });

  // Correct confirmation number + email -> entitled.
  const ok = await post({ orderNumber: num, email });
  assert.equal(ok.status, 200, 'digital order accepted');
  const okBody = await ok.json();
  assert.equal(okBody.entitled, true, 'entitled');
  assert.ok(okBody.token, 'access token minted');
  console.log('  ✓ confirmation number + email -> access granted');

  // Case-insensitive order number, wrong email -> 401.
  assert.equal((await post({ orderNumber: num, email: 'wrong@test.local' })).status, 401, 'wrong email rejected');
  assert.equal((await post({ orderNumber: num.toLowerCase(), email })).status, 200, 'order number case-insensitive');
  console.log('  ✓ wrong email rejected; order number case-insensitive');

  // Non-digital order -> 401.
  const physNum = await makeOrder({ digital: false, email: 'phys@test.local' });
  assert.equal((await post({ orderNumber: physNum, email: 'phys@test.local' })).status, 401, 'non-digital rejected');
  // Unpaid digital order -> 401.
  const unpaidNum = await makeOrder({ digital: true, status: 'pending', email: 'pend@test.local' });
  assert.equal((await post({ orderNumber: unpaidNum, email: 'pend@test.local' })).status, 401, 'unpaid rejected');
  console.log('  ✓ non-digital and unpaid orders rejected');

  // VOD requires the entitlement token.
  assert.equal((await fetch(`${BASE}/virtual/vod`)).status, 401, 'VOD without token rejected');
  assert.equal((await fetch(`${BASE}/virtual/vod?token=${encodeURIComponent(okBody.token)}`)).status, 200, 'VOD with token allowed');
  console.log('  ✓ gated VOD: rejects missing token, allows valid token');

  const status = await (await fetch(`${BASE}/virtual/status`)).json();
  assert.equal(typeof status.configured, 'boolean', 'status returns configured flag');
  console.log('  ✓ public stream status endpoint');

  console.log('\nALL VIRTUAL-FLOW ASSERTIONS PASSED');
  await pool.end();
}

main().catch((e) => { console.error('TEST FAILED:', e.message); process.exit(1); });
