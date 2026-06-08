// E2E for the store (§10): server-side pricing, oversell protection, paid
// webhook -> inventory decrement + shipping address capture.
import assert from 'node:assert';
import Stripe from 'stripe';
import { pool } from '../src/db/pool.js';
import { setSetting } from '../src/lib/settings.js';
import { computeStoreOrder, createPendingStoreOrder } from '../src/lib/orders.js';

const BASE = process.env.BASE || 'http://localhost:4000/api/v1';
const WEBHOOK_SECRET = 'whsec_test_secret_for_local_only';
const stripe = new Stripe('sk_test_placeholder');

async function main() {
  await setSetting('stripe.secret_key', 'sk_test_placeholder', null);
  await setSetting('stripe.webhook_secret', WEBHOOK_SECRET, null);

  const v = (await pool.query(`SELECT id, inventory FROM product_variants WHERE sku='TEE-M'`)).rows[0];
  const startInv = v.inventory;

  // Pricing from DB (tee inherits product price 2500).
  const computed = await computeStoreOrder([{ variantId: v.id, quantity: 2 }]);
  assert.equal(computed.totalCents, 5000, 'store order priced server-side');
  console.log('  ✓ store cart priced server-side from DB');

  // Oversell protection: drop inventory to 1, request 3 (within the per-item
  // cap but above stock), expect out_of_stock; then restore.
  await pool.query(`UPDATE product_variants SET inventory=1 WHERE id=$1`, [v.id]);
  await assert.rejects(
    () => computeStoreOrder([{ variantId: v.id, quantity: 3 }]),
    (e) => e.code === 'out_of_stock',
    'oversell rejected',
  );
  await pool.query(`UPDATE product_variants SET inventory=$2 WHERE id=$1`, [v.id, startInv]);
  console.log('  ✓ oversell rejected (out_of_stock)');

  // Build pending order and fulfill via signed webhook (with shipping).
  const order = await createPendingStoreOrder({
    customer: { name: 'Merch Buyer', email: 'merch@test.local' },
    computed,
  });
  const sessionId = `cs_test_store_${Date.now()}`;
  await pool.query(`UPDATE orders SET stripe_session_id=$2 WHERE id=$1`, [order.id, sessionId]);

  const event = {
    id: `evt_store_${Date.now()}`,
    type: 'checkout.session.completed',
    data: {
      object: {
        id: sessionId,
        payment_intent: 'pi_store',
        metadata: { order_id: order.id },
        shipping_details: { name: 'Merch Buyer', address: { line1: '1 Test St', city: 'Chicago', state: 'IL', postal_code: '60601', country: 'US' } },
      },
    },
  };
  const payload = JSON.stringify(event);
  const header = stripe.webhooks.generateTestHeaderString({ payload, secret: WEBHOOK_SECRET });
  const r = await fetch(`${BASE}/webhooks/stripe`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Stripe-Signature': header },
    body: payload,
  });
  assert.equal(r.status, 200, 'store webhook accepted');

  const after = (await pool.query(`SELECT inventory FROM product_variants WHERE id=$1`, [v.id])).rows[0];
  assert.equal(after.inventory, startInv - 2, 'inventory decremented on payment');
  console.log('  ✓ paid webhook -> inventory decremented');

  const paid = (await pool.query(`SELECT status, shipping_address FROM orders WHERE id=$1`, [order.id])).rows[0];
  assert.equal(paid.status, 'paid', 'order paid');
  assert.ok(paid.shipping_address?.address?.city === 'Chicago', 'shipping address captured');
  console.log('  ✓ shipping address captured for physical goods');

  console.log('\nALL STORE-FLOW ASSERTIONS PASSED');
  await pool.end();
}

main().catch((e) => {
  console.error('TEST FAILED:', e.message);
  process.exit(1);
});
