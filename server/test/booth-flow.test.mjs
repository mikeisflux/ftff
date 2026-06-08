// E2E for the vendor floor (§9): atomic soft-hold (no double-claim), webhook
// fulfillment -> booth sold, and the expired-hold release job. The Stripe
// Checkout API call in POST /checkout/booth needs network, so we exercise the
// same hold SQL + the signed-webhook fulfillment path directly.
import assert from 'node:assert';
import Stripe from 'stripe';
import { pool } from '../src/db/pool.js';
import { setSetting } from '../src/lib/settings.js';
import { randomToken } from '../src/lib/crypto.js';
import { releaseExpiredHolds } from '../src/jobs/releaseHolds.js';

const BASE = process.env.BASE || 'http://localhost:4000/api/v1';
const WEBHOOK_SECRET = 'whsec_test_secret_for_local_only';
const stripe = new Stripe('sk_test_placeholder');

async function main() {
  await setSetting('stripe.secret_key', 'sk_test_placeholder', null);
  await setSetting('stripe.webhook_secret', WEBHOOK_SECRET, null);

  // Reset a booth to available for a clean run.
  const booth = (await pool.query(`SELECT id, price_cents FROM booths ORDER BY label LIMIT 1`)).rows[0];
  await pool.query(`UPDATE booths SET status='available', held_until=NULL, order_id=NULL WHERE id=$1`, [booth.id]);

  const heldUntil = new Date(Date.now() + 15 * 60_000);
  // Atomic claim #1 succeeds.
  const c1 = await pool.query(
    `UPDATE booths SET status='held', held_until=$2 WHERE id=$1 AND status='available' RETURNING id`,
    [booth.id, heldUntil],
  );
  assert.equal(c1.rowCount, 1, 'first hold claims the booth');
  // Concurrent claim #2 on the same booth gets nothing (no double-sell).
  const c2 = await pool.query(
    `UPDATE booths SET status='held', held_until=$2 WHERE id=$1 AND status='available' RETURNING id`,
    [booth.id, heldUntil],
  );
  assert.equal(c2.rowCount, 0, 'second hold blocked while held');
  console.log('  ✓ booth soft-hold is atomic (no double-claim)');

  // Build the vendor order the way /checkout/booth does, then fulfill it.
  const order = (
    await pool.query(
      `INSERT INTO orders (order_number, customer_name, customer_email, kind, subtotal_cents, total_cents, status, stripe_session_id)
       VALUES ($1,'Acme Co','acme@test.local','vendor',$2,$2,'pending',$3) RETURNING id`,
      [`FX-BTH-${randomToken(2).toUpperCase()}`, booth.price_cents, `cs_test_${Date.now()}`],
    )
  ).rows[0];
  await pool.query(
    `INSERT INTO order_items (order_id, kind, booth_id, description, unit_price_cents, quantity)
     VALUES ($1,'booth',$2,'Booth',$3,1)`,
    [order.id, booth.id, booth.price_cents],
  );
  await pool.query(`UPDATE booths SET order_id=$2 WHERE id=$1`, [booth.id, order.id]);

  const event = {
    id: `evt_booth_${Date.now()}`,
    type: 'checkout.session.completed',
    data: { object: { id: `cs_test_${Date.now()}`, payment_intent: 'pi_booth', metadata: { order_id: order.id } } },
  };
  const payload = JSON.stringify(event);
  const header = stripe.webhooks.generateTestHeaderString({ payload, secret: WEBHOOK_SECRET });
  const r = await fetch(`${BASE}/webhooks/stripe`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Stripe-Signature': header },
    body: payload,
  });
  assert.equal(r.status, 200, 'booth webhook accepted');
  const sold = (await pool.query(`SELECT status, order_id FROM booths WHERE id=$1`, [booth.id])).rows[0];
  assert.equal(sold.status, 'sold', 'booth marked sold on payment');
  assert.equal(sold.order_id, order.id, 'booth linked to order');
  console.log('  ✓ paid webhook -> booth sold + linked to order');

  // Expired-hold release: hold a second booth in the past, run the job.
  const b2 = (await pool.query(`SELECT id FROM booths WHERE status='available' ORDER BY label LIMIT 1`)).rows[0];
  const pend = (
    await pool.query(
      `INSERT INTO orders (order_number, kind, total_cents, status) VALUES ($1,'vendor',1000,'pending') RETURNING id`,
      [`FX-EXP-${randomToken(2).toUpperCase()}`],
    )
  ).rows[0];
  await pool.query(
    `UPDATE booths SET status='held', held_until=now() - interval '1 minute', order_id=$2 WHERE id=$1`,
    [b2.id, pend.id],
  );
  const released = await releaseExpiredHolds();
  assert.ok(released >= 1, 'expired hold released');
  const back = (await pool.query(`SELECT status, order_id FROM booths WHERE id=$1`, [b2.id])).rows[0];
  assert.equal(back.status, 'available', 'booth back to available');
  assert.equal(back.order_id, null, 'order link cleared');
  const cancelled = (await pool.query(`SELECT status FROM orders WHERE id=$1`, [pend.id])).rows[0];
  assert.equal(cancelled.status, 'cancelled', 'abandoned pending order cancelled');
  console.log('  ✓ expired holds released + abandoned order cancelled');

  console.log('\nALL BOOTH-FLOW ASSERTIONS PASSED');
  await pool.end();
}

main().catch((e) => {
  console.error('TEST FAILED:', e.message);
  process.exit(1);
});
