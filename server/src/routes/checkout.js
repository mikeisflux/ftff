import { Router } from 'express';
import { z } from 'zod';
import { query } from '../db/pool.js';
import { env } from '../config/env.js';
import { asyncHandler, notFound } from '../lib/http.js';
import { formLimiter } from '../middleware/rateLimit.js';
import { withTransaction } from '../db/pool.js';
import { getStripe } from '../lib/stripe.js';
import { getSettingValue } from '../lib/settings.js';
import { HttpError } from '../lib/http.js';
import { randomToken } from '../lib/crypto.js';
import {
  computeTicketOrder,
  createPendingTicketOrder,
  computeStoreOrder,
  createPendingStoreOrder,
} from '../lib/orders.js';

// Guest checkout for tickets (§8, §15). Amounts are computed server-side; the
// browser is handed only the Stripe-hosted Checkout URL (SAQ A — card data
// never touches our server).
export const checkoutRouter = Router();

const cartSchema = z.object({
  items: z
    .array(z.object({ code: z.string().min(1), quantity: z.number().int().min(1).max(20) }))
    .min(1),
  customer: z.object({
    name: z.string().min(1).max(200),
    email: z.string().email(),
    phone: z.string().max(40).optional(),
  }),
});

// POST /checkout/tickets -> { url, sessionId }
checkoutRouter.post(
  '/tickets',
  formLimiter,
  asyncHandler(async (req, res) => {
    const { items, customer } = cartSchema.parse(req.body);

    // Verify Stripe is configured BEFORE creating an order, so a misconfigured
    // site doesn't leave orphan pending orders.
    const stripe = await getStripe();

    // Authoritative pricing + availability check, then a pending order.
    const computed = await computeTicketOrder(items);
    const order = await createPendingTicketOrder({ customer, computed });

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      customer_email: customer.email,
      line_items: computed.lines.map((l) => ({
        quantity: l.quantity,
        price_data: {
          currency: computed.currency,
          unit_amount: l.unitPriceCents,
          product_data: { name: l.name },
        },
      })),
      metadata: { order_id: order.id, order_number: order.order_number },
      success_url: `${env.CLIENT_ORIGIN}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${env.CLIENT_ORIGIN}/buy-tickets`,
    });

    await query(`UPDATE orders SET stripe_session_id = $2 WHERE id = $1`, [order.id, session.id]);
    res.json({ url: session.url, sessionId: session.id, orderNumber: order.order_number });
  }),
);

const storeSchema = z.object({
  items: z.array(z.object({ variantId: z.string().uuid(), quantity: z.number().int().min(1).max(50) })).min(1),
  customer: z.object({
    name: z.string().min(1).max(200),
    email: z.string().email(),
    phone: z.string().max(40).optional(),
  }),
});

// POST /checkout/store — store cart -> Stripe Checkout. Prices server-side,
// checks inventory, and collects a shipping address for physical goods (§10).
checkoutRouter.post(
  '/store',
  formLimiter,
  asyncHandler(async (req, res) => {
    const { items, customer } = storeSchema.parse(req.body);
    const stripe = await getStripe();
    const computed = await computeStoreOrder(items);
    const order = await createPendingStoreOrder({ customer, computed });

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      customer_email: customer.email,
      shipping_address_collection: { allowed_countries: ['US', 'CA'] },
      line_items: computed.lines.map((l) => ({
        quantity: l.quantity,
        price_data: {
          currency: computed.currency,
          unit_amount: l.unitPriceCents,
          product_data: { name: l.name },
        },
      })),
      metadata: { order_id: order.id, order_number: order.order_number },
      success_url: `${env.CLIENT_ORIGIN}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${env.CLIENT_ORIGIN}/cart`,
    });
    await query(`UPDATE orders SET stripe_session_id=$2 WHERE id=$1`, [order.id, session.id]);
    res.json({ url: session.url, sessionId: session.id, orderNumber: order.order_number });
  }),
);

const boothSchema = z.object({
  boothId: z.string().uuid(),
  vendor: z.object({
    name: z.string().min(1).max(200),
    email: z.string().email(),
    phone: z.string().max(40).optional(),
  }),
});

// POST /checkout/booth — atomically soft-holds the booth, creates a vendor
// order, and opens Stripe Checkout. The hold (status=held, held_until) prevents
// two vendors buying the same booth mid-checkout (§9); a background job releases
// expired holds.
checkoutRouter.post(
  '/booth',
  formLimiter,
  asyncHandler(async (req, res) => {
    const { boothId, vendor } = boothSchema.parse(req.body);
    const stripe = await getStripe();
    const holdMinutes = Number(await getSettingValue('vendor.hold_minutes')) || 15;
    const currency = (await getSettingValue('stripe.currency')) || 'usd';
    const heldUntil = new Date(Date.now() + holdMinutes * 60_000);

    const { order, booth } = await withTransaction(async (client) => {
      // Atomic claim: only an available booth can be held.
      const claim = await client.query(
        `UPDATE booths SET status='held', held_until=$2
          WHERE id=$1 AND status='available'
          RETURNING id, label, zone, price_cents`,
        [boothId, heldUntil],
      );
      if (claim.rowCount === 0) {
        throw new HttpError(409, 'That booth is no longer available.', 'booth_unavailable');
      }
      const b = claim.rows[0];
      const ord = (
        await client.query(
          `INSERT INTO orders (order_number, customer_name, customer_email, customer_phone,
                               kind, subtotal_cents, total_cents, currency, status)
           VALUES ($1,$2,$3,$4,'vendor',$5,$5,$6,'pending') RETURNING *`,
          [`FX-${Date.now().toString(36).toUpperCase()}-${randomToken(2).toUpperCase()}`,
            vendor.name, vendor.email, vendor.phone ?? null, b.price_cents, currency],
        )
      ).rows[0];
      await client.query(
        `INSERT INTO order_items (order_id, kind, booth_id, description, unit_price_cents, quantity)
         VALUES ($1,'booth',$2,$3,$4,1)`,
        [ord.id, b.id, `Booth ${b.label}${b.zone ? ` (${b.zone})` : ''}`, b.price_cents],
      );
      await client.query(`UPDATE booths SET order_id=$2 WHERE id=$1`, [b.id, ord.id]);
      return { order: ord, booth: b };
    });

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      customer_email: vendor.email,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency,
            unit_amount: booth.price_cents,
            product_data: { name: `Booth ${booth.label}` },
          },
        },
      ],
      metadata: { order_id: order.id, order_number: order.order_number, booth_id: booth.id },
      success_url: `${env.CLIENT_ORIGIN}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${env.CLIENT_ORIGIN}/floor-plan`,
    });
    await query(`UPDATE orders SET stripe_session_id=$2 WHERE id=$1`, [order.id, session.id]);
    res.json({ url: session.url, sessionId: session.id, orderNumber: order.order_number });
  }),
);

// GET /checkout/session/:sessionId — post-redirect confirmation for the buyer.
// Returns order status and (once paid) the issued ticket tokens so the success
// page can show the mobile tickets immediately, before email delivery.
checkoutRouter.get(
  '/session/:sessionId',
  asyncHandler(async (req, res) => {
    const { rows } = await query(
      `SELECT id, order_number, status, total_cents, currency, customer_email
         FROM orders WHERE stripe_session_id = $1`,
      [req.params.sessionId],
    );
    const order = rows[0];
    if (!order) throw notFound('Order not found');

    let tickets = [];
    if (order.status === 'paid') {
      tickets = (
        await query(
          `SELECT t.qr_token, t.attendee_name, tt.name AS ticket_name
             FROM tickets t JOIN ticket_types tt ON tt.id = t.ticket_type_id
            WHERE t.order_id = $1 ORDER BY t.created_at`,
          [order.id],
        )
      ).rows;
    }

    res.json({
      order: {
        orderNumber: order.order_number,
        status: order.status,
        totalCents: order.total_cents,
        currency: order.currency,
      },
      tickets,
    });
  }),
);
