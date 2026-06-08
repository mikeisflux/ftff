import { withTransaction } from '../db/pool.js';
import { randomToken } from './crypto.js';
import { audit } from './audit.js';

// Webhook-driven fulfillment (§15). The Stripe webhook is the source of truth.
// This runs inside a transaction, locks the order row, and is idempotent: a
// replayed event will not issue tickets twice.

/**
 * Fulfill a paid Checkout Session: mark the order paid and issue one ticket per
 * purchased seat with a unique, unguessable qr_token. Atomically bumps
 * quantity_sold. Returns { order, issued, alreadyPaid }.
 */
export async function fulfillCheckoutSession(session) {
  const orderId = session.metadata?.order_id;
  if (!orderId) return { skipped: 'no_order_id' };

  return withTransaction(async (client) => {
    const { rows } = await client.query(
      `SELECT * FROM orders WHERE id = $1 FOR UPDATE`,
      [orderId],
    );
    const order = rows[0];
    if (!order) return { skipped: 'order_not_found' };

    // Idempotent: already fulfilled.
    if (order.status === 'paid') {
      return { order, alreadyPaid: true, issued: [] };
    }

    await client.query(
      `UPDATE orders SET status = 'paid', paid_at = now(),
              stripe_payment_intent = $2, stripe_session_id = COALESCE(stripe_session_id, $3)
        WHERE id = $1`,
      [orderId, session.payment_intent ?? null, session.id ?? null],
    );

    const items = (
      await client.query(`SELECT * FROM order_items WHERE order_id = $1`, [orderId])
    ).rows;

    const issued = [];
    for (const it of items) {
      if (it.kind === 'ticket') {
        for (let i = 0; i < it.quantity; i += 1) {
          const token = randomToken(24); // 48 hex chars, unguessable
          const t = await client.query(
            `INSERT INTO tickets (order_id, ticket_type_id, attendee_name, qr_token)
             VALUES ($1, $2, $3, $4) RETURNING id, qr_token`,
            [orderId, it.ticket_type_id, order.customer_name, token],
          );
          issued.push(t.rows[0]);
        }
        await client.query(
          `UPDATE ticket_types SET quantity_sold = quantity_sold + $2 WHERE id = $1`,
          [it.ticket_type_id, it.quantity],
        );
      } else if (it.kind === 'booth') {
        // Booth is sold to this order; clear the soft hold.
        await client.query(
          `UPDATE booths SET status='sold', held_until=NULL WHERE id=$1`,
          [it.booth_id],
        );
      } else if (it.kind === 'product') {
        // Decrement inventory atomically (oversell-safe; floor at 0).
        if (it.variant_id) {
          await client.query(
            `UPDATE product_variants SET inventory = GREATEST(inventory - $2, 0) WHERE id=$1`,
            [it.variant_id, it.quantity],
          );
        }
      }
    }

    await audit(null, 'order.fulfilled', {
      entity: 'order',
      entityId: orderId,
      meta: { kind: order.kind, tickets: issued.length },
    });

    return { order, issued, alreadyPaid: false };
  });
}
