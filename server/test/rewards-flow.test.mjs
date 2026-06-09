// E2E for Exhibitor Rewards: enroll -> referral credit on a paid ticket order
// -> idempotent -> self-referral ignored. The Stripe Checkout API needs network,
// so we drive the fulfillment path directly with a synthetic session.
import assert from 'node:assert';
import { pool } from '../src/db/pool.js';
import { enrollReward, creditReferral, REWARD_RATE } from '../src/lib/rewards.js';
import { randomToken } from '../src/lib/crypto.js';

async function main() {
  // Enroll an exhibitor (idempotent on email).
  const r1 = await enrollReward({ name: 'Test Exhibitor', email: `rw_${Date.now()}@test.local` });
  const r2 = await enrollReward({ name: 'Test Exhibitor', email: r1.email });
  assert.equal(r1.id, r2.id, 'enroll is idempotent by email');
  assert.ok(r1.code, 'a share code is issued');
  console.log('  ✓ enroll issues a share code, idempotent by email');

  // A paid ticket order referred by the code credits 5%.
  const orderRow = (await pool.query(
    `INSERT INTO orders (order_number, customer_name, customer_email, kind, subtotal_cents, total_cents, status, referral_code)
     VALUES ($1,'Fan','fan@test.local','ticket',8000,8000,'paid',$2) RETURNING *`,
    [`RW-${randomToken(2).toUpperCase()}`, r1.code],
  )).rows[0];

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await creditReferral(client, orderRow);
    await client.query('COMMIT');
  } finally { client.release(); }

  const after = (await pool.query(`SELECT * FROM exhibitor_rewards WHERE id=$1`, [r1.id])).rows[0];
  assert.equal(after.balance_cents, Math.round(8000 * REWARD_RATE), 'earns 5% of the sale');
  assert.equal(after.earned_cents, 400, 'lifetime earned recorded');
  const credited = (await pool.query(`SELECT reward_credited FROM orders WHERE id=$1`, [orderRow.id])).rows[0];
  assert.equal(credited.reward_credited, true, 'order marked credited');
  console.log('  ✓ referred paid ticket order credits 5%');

  // Idempotent: re-crediting the same (now-credited) order does nothing.
  const reload = (await pool.query(`SELECT * FROM orders WHERE id=$1`, [orderRow.id])).rows[0];
  const c2 = await pool.connect();
  try { await c2.query('BEGIN'); await creditReferral(c2, reload); await c2.query('COMMIT'); } finally { c2.release(); }
  const after2 = (await pool.query(`SELECT balance_cents FROM exhibitor_rewards WHERE id=$1`, [r1.id])).rows[0];
  assert.equal(after2.balance_cents, 400, 'no double credit');
  console.log('  ✓ crediting is idempotent (no double credit)');

  // Self-referral is ignored (exhibitor buying through their own link).
  const selfOrder = (await pool.query(
    `INSERT INTO orders (order_number, customer_email, kind, subtotal_cents, total_cents, status, referral_code)
     VALUES ($1,$2,'ticket',5000,5000,'paid',$3) RETURNING *`,
    [`RW-${randomToken(2).toUpperCase()}`, r1.email, r1.code],
  )).rows[0];
  const c3 = await pool.connect();
  try { await c3.query('BEGIN'); await creditReferral(c3, selfOrder); await c3.query('COMMIT'); } finally { c3.release(); }
  const after3 = (await pool.query(`SELECT balance_cents FROM exhibitor_rewards WHERE id=$1`, [r1.id])).rows[0];
  assert.equal(after3.balance_cents, 400, 'self-referral not credited');
  console.log('  ✓ self-referral is ignored');

  console.log('\nALL REWARDS-FLOW ASSERTIONS PASSED');
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
