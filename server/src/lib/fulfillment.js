import { withTransaction } from '../db/pool.js';
import { randomToken } from './crypto.js';
import { audit } from './audit.js';
import { commit as commitInventory } from './inventory.js';

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

    // Persist the shipping address collected by Stripe Checkout for physical
    // goods, when present.
    const shipping = session.shipping_details ?? session.shipping ?? null;
    await client.query(
      `UPDATE orders SET status = 'paid', paid_at = now(),
              stripe_payment_intent = $2, stripe_session_id = COALESCE(stripe_session_id, $3),
              shipping_address = COALESCE($4, shipping_address)
        WHERE id = $1`,
      [orderId, session.payment_intent ?? null, session.id ?? null,
        shipping ? JSON.stringify(shipping) : null],
    );

    const items = (
      await client.query(
        `SELECT oi.*, tt.is_digital
           FROM order_items oi LEFT JOIN ticket_types tt ON tt.id = oi.ticket_type_id
          WHERE oi.order_id = $1`,
        [orderId],
      )
    ).rows;

    const issued = [];
    for (const it of items) {
      if (it.kind === 'ticket') {
        // Digital tickets are NOT scannable — no QR is issued. Holders access the
        // Live session with their order (confirmation) number + email instead.
        if (!it.is_digital) {
          for (let i = 0; i < it.quantity; i += 1) {
            const token = randomToken(24); // 48 hex chars, unguessable
            const t = await client.query(
              `INSERT INTO tickets (order_id, ticket_type_id, attendee_name, qr_token)
               VALUES ($1, $2, $3, $4) RETURNING id, qr_token`,
              [orderId, it.ticket_type_id, order.customer_name, token],
            );
            issued.push(t.rows[0]);
          }
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

/**
 * Fulfill a paid exhibitor Checkout Session (Become an Exhibitor flow). Phase is
 * 'deposit' | 'full' (first payment) or 'balance' (later balance settlement).
 * Idempotent and oversell-safe: tables move reserved -> sold on the first
 * payment; the booth is marked sold; balance is recomputed. Returns
 * { application, phase, alreadyPaid }.
 */
export async function fulfillExhibitorSession(session) {
  const appId = session.metadata?.application_id;
  const phase = session.metadata?.phase || 'full';
  if (!appId) return { skipped: 'no_application_id' };
  const amountPaid = session.amount_total ?? 0;

  return withTransaction(async (client) => {
    const { rows } = await client.query(
      `SELECT * FROM exhibitor_applications WHERE id = $1 FOR UPDATE`,
      [appId],
    );
    const app = rows[0];
    if (!app) return { skipped: 'application_not_found' };

    // Idempotency guards for replayed events.
    if (phase === 'balance' && app.status === 'paid_in_full') {
      return { application: app, phase, alreadyPaid: true };
    }
    if (phase !== 'balance' && ['deposit_paid', 'paid_in_full'].includes(app.status)) {
      return { application: app, phase, alreadyPaid: true };
    }

    if (phase === 'balance') {
      const updated = await client.query(
        `UPDATE exhibitor_applications
            SET amount_paid_cents = amount_paid_cents + $2, balance_cents = 0,
                status = 'paid_in_full'
          WHERE id = $1 RETURNING *`,
        [appId, amountPaid],
      );
      await audit(null, 'exhibitor.balance_paid', { entity: 'exhibitor', entityId: appId, meta: { amountPaid } });
      return { application: updated.rows[0], phase, alreadyPaid: false };
    }

    // First payment (deposit or full): commit tables, mark booth sold.
    if (app.reserved_tables > 0) {
      await commitInventory('extra_tables', app.reserved_tables, client);
    }
    if (app.booth_id) {
      await client.query(
        `UPDATE booths SET status='sold', held_until=NULL WHERE id=$1`,
        [app.booth_id],
      );
    }
    const newStatus = phase === 'full' ? 'paid_in_full' : 'deposit_paid';
    const balance = phase === 'full' ? 0 : Math.max(app.total_cents - amountPaid, 0);
    const updated = await client.query(
      `UPDATE exhibitor_applications
          SET amount_paid_cents = amount_paid_cents + $2, balance_cents = $3,
              status = $4, hold_until = NULL
        WHERE id = $1 RETURNING *`,
      [appId, amountPaid, balance, newStatus],
    );
    await audit(null, 'exhibitor.paid', { entity: 'exhibitor', entityId: appId, meta: { phase, amountPaid } });
    return { application: updated.rows[0], phase, alreadyPaid: false };
  });
}
