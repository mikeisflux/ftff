// End-to-end test of the payment fulfillment path WITHOUT hitting Stripe's
// network: we build a Checkout Session event, sign it with the configured
// webhook secret using Stripe's own test-signature helper, POST it to the
// webhook, and assert order→paid + tickets issued + idempotency. Run while the
// API server is up:  node server/test/checkout-flow.test.mjs
import assert from 'node:assert';
import Stripe from 'stripe';
import { pool } from '../src/db/pool.js';
import { setSetting } from '../src/lib/settings.js';
import { computeTicketOrder, createPendingTicketOrder } from '../src/lib/orders.js';

const BASE = process.env.BASE || 'http://localhost:4000/api/v1';
const WEBHOOK_SECRET = 'whsec_test_secret_for_local_only';
const stripe = new Stripe('sk_test_placeholder');

async function main() {
  // 1. Configure Stripe settings (encrypted at rest via setSetting).
  await setSetting('stripe.secret_key', 'sk_test_placeholder', null);
  await setSetting('stripe.webhook_secret', WEBHOOK_SECRET, null);

  // 2. Build a pending order server-side (authoritative pricing).
  const computed = await computeTicketOrder([
    { code: 'three_day', quantity: 2 },
    { code: 'digital', quantity: 1 },
  ]);
  assert.equal(computed.totalCents, 8000 * 2 + 1000, 'total computed from DB prices');
  const order = await createPendingTicketOrder({
    customer: { name: 'Test Buyer', email: 'buyer@example.com' },
    computed,
  });
  console.log('  ✓ pending order', order.order_number, 'total', computed.totalCents);

  // 3. Craft a signed checkout.session.completed event.
  const event = {
    id: `evt_${Date.now()}`,
    type: 'checkout.session.completed',
    data: {
      object: {
        id: `cs_test_${Date.now()}`,
        object: 'checkout.session',
        payment_intent: 'pi_test_123',
        metadata: { order_id: order.id, order_number: order.order_number },
      },
    },
  };
  const payload = JSON.stringify(event);
  const header = stripe.webhooks.generateTestHeaderString({ payload, secret: WEBHOOK_SECRET });

  // 4. POST to the webhook (raw body + signature).
  const r1 = await fetch(`${BASE}/webhooks/stripe`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Stripe-Signature': header },
    body: payload,
  });
  assert.equal(r1.status, 200, 'webhook accepted');
  console.log('  ✓ webhook accepted (valid signature)');

  // 5. Order paid + only the 2 physical (3-Day) tickets get QR rows; the Digital
  //    ticket is intentionally NOT scannable (no QR).
  const paid = (await pool.query('SELECT status FROM orders WHERE id=$1', [order.id])).rows[0];
  assert.equal(paid.status, 'paid', 'order marked paid');
  const tickets = (await pool.query('SELECT qr_token FROM tickets WHERE order_id=$1', [order.id])).rows;
  assert.equal(tickets.length, 2, 'physical seats get QR; digital does not');
  assert.equal(new Set(tickets.map((t) => t.qr_token)).size, 2, 'tokens unique');
  console.log('  ✓ order paid, 2 physical tickets issued (digital = no QR)');

  // 6. Replay the SAME event → idempotent (no extra tickets).
  const r2 = await fetch(`${BASE}/webhooks/stripe`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Stripe-Signature': header },
    body: payload,
  });
  const body2 = await r2.json();
  assert.equal(body2.duplicate, true, 'duplicate event deduped');
  const count2 = (await pool.query('SELECT count(*)::int n FROM tickets WHERE order_id=$1', [order.id])).rows[0].n;
  assert.equal(count2, 2, 'no double-issue on replay');
  console.log('  ✓ replayed event deduped, no double-issue');

  // 7. Tampered signature is rejected.
  const rBad = await fetch(`${BASE}/webhooks/stripe`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Stripe-Signature': 't=1,v1=deadbeef' },
    body: payload,
  });
  assert.equal(rBad.status, 400, 'invalid signature rejected');
  console.log('  ✓ invalid signature rejected (400)');

  // 8. Public mobile ticket page returns a QR.
  const tr = await fetch(`${BASE}/t/${tickets[0].qr_token}`);
  const tj = await tr.json();
  assert.ok(tj.ticket.qr.startsWith('data:image/png;base64,'), 'inline QR present');
  assert.equal(tj.ticket.status, 'valid', 'ticket valid');
  console.log('  ✓ mobile ticket page renders QR');

  // 9. Ticket-delivery email is wired and config-gated: with SendGrid unset it
  //    skips gracefully (no throw) rather than being a dead stub.
  const { sendTicketDelivery } = await import('../src/lib/email.js');
  const fullOrder = (await pool.query('SELECT * FROM orders WHERE id=$1', [order.id])).rows[0];
  const emailResult = await sendTicketDelivery(fullOrder);
  assert.equal(emailResult.skipped, true, 'email skipped when SendGrid unconfigured');
  assert.equal(emailResult.reason, 'sendgrid_unconfigured', 'graceful skip reason');
  console.log('  ✓ ticket-delivery email wired (gracefully skips until SendGrid configured)');

  // 10. Checkout cleanly reports unconfigured Stripe (no orphan order created).
  await (await import('../src/lib/settings.js')).clearSetting('stripe.secret_key', null);
  const before = (await pool.query('SELECT count(*)::int n FROM orders')).rows[0].n;
  const rUnconf = await fetch(`${BASE}/checkout/tickets`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ items: [{ code: 'friday', quantity: 1 }], customer: { name: 'X', email: 'x@y.com' } }),
  });
  const unconfBody = await rUnconf.json();
  assert.equal(rUnconf.status, 503, 'checkout returns 503 when Stripe unconfigured');
  assert.equal(unconfBody.code, 'stripe_unconfigured', 'clear error code');
  const after = (await pool.query('SELECT count(*)::int n FROM orders')).rows[0].n;
  assert.equal(after, before, 'no orphan order created on unconfigured checkout');
  console.log('  ✓ unconfigured checkout: 503 + no orphan order');
  await setSetting('stripe.secret_key', 'sk_test_placeholder', null); // restore

  console.log('\nALL CHECKOUT-FLOW ASSERTIONS PASSED');
  await pool.end();
}

main().catch((e) => {
  console.error('TEST FAILED:', e.message);
  process.exit(1);
});
