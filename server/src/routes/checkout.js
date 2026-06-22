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
import { subscribeEmail } from '../lib/newsletter.js';
import {
  computeTicketOrder,
  createPendingTicketOrder,
  computeStoreOrder,
  createPendingStoreOrder,
} from '../lib/orders.js';
import { fulfillCheckoutSession } from '../lib/fulfillment.js';
import { sendTicketDelivery, sendBoothConfirmation, sendOrderConfirmation } from '../lib/email.js';

// Fallback fulfillment for the confirmation page: the Stripe webhook is the
// source of truth, but if it's delayed or unconfigured the buyer would be stuck
// on "pending". So when the success page asks for status, we verify directly
// with Stripe and fulfill on the spot — fulfillCheckoutSession is idempotent, so
// this never double-issues if the webhook also runs.
async function fulfillAndNotify(sessionLike) {
  const result = await fulfillCheckoutSession(sessionLike);
  if (result?.order && !result.alreadyPaid) {
    const order = result.order;
    const send = order.kind === 'ticket' ? sendTicketDelivery
      : order.kind === 'vendor' ? sendBoothConfirmation
      : sendOrderConfirmation;
    await send(order).catch((e) => console.error('Confirmation email failed:', e.message));
  }
  return result;
}

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
  referralCode: z.string().max(40).optional().nullable(),
});

// POST /checkout/tickets -> { url, sessionId }
checkoutRouter.post(
  '/tickets',
  formLimiter,
  asyncHandler(async (req, res) => {
    const { items, customer, referralCode } = cartSchema.parse(req.body);
    subscribeEmail(customer.email, { name: customer.name, source: 'ticket-purchase' }).catch(() => {});

    // Verify Stripe is configured BEFORE creating an order, so a misconfigured
    // site doesn't leave orphan pending orders.
    const stripe = await getStripe();

    // Authoritative pricing + availability check, then a pending order.
    const computed = await computeTicketOrder(items);
    const order = await createPendingTicketOrder({ customer, computed });
    // Attribute the sale to a referring exhibitor's share link, if present.
    if (referralCode) {
      await query(`UPDATE orders SET referral_code = $2 WHERE id = $1`, [order.id, referralCode.trim()]);
    }

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

// POST /checkout/tickets/intent — on-site (white-label) checkout. Creates a
// PaymentIntent so the branded Stripe Payment Element can collect payment
// directly on forfansfest.com. automatic_payment_methods surfaces every method
// enabled on the Stripe account (cards, wallets, Klarna, etc.).
checkoutRouter.post(
  '/tickets/intent',
  formLimiter,
  asyncHandler(async (req, res) => {
    const { items, customer, referralCode } = cartSchema.parse(req.body);
    subscribeEmail(customer.email, { name: customer.name, source: 'ticket-purchase' }).catch(() => {});
    const stripe = await getStripe();
    const computed = await computeTicketOrder(items);
    const order = await createPendingTicketOrder({ customer, computed });
    if (referralCode) {
      await query(`UPDATE orders SET referral_code = $2 WHERE id = $1`, [order.id, referralCode.trim()]);
    }
    const intent = await stripe.paymentIntents.create({
      amount: computed.totalCents,
      currency: computed.currency,
      automatic_payment_methods: { enabled: true },
      receipt_email: customer.email,
      description: `Tickets — ${order.order_number}`,
      metadata: { order_id: order.id, order_number: order.order_number, kind: 'ticket' },
    });
    await query(`UPDATE orders SET stripe_payment_intent = $2 WHERE id = $1`, [order.id, intent.id]);
    res.json({
      clientSecret: intent.client_secret,
      orderNumber: order.order_number,
      amountCents: computed.totalCents,
      currency: computed.currency,
    });
  }),
);

// GET /checkout/intent/:piId — post-payment confirmation lookup (Payment Element
// flow). Mirrors /session/:sessionId but keyed by PaymentIntent id.
checkoutRouter.get(
  '/intent/:piId',
  asyncHandler(async (req, res) => {
    const { rows } = await query(
      `SELECT id, order_number, status, total_cents, currency FROM orders WHERE stripe_payment_intent = $1`,
      [req.params.piId],
    );
    let order = rows[0];
    if (!order) throw notFound('Order not found');

    // Don't wait on the webhook — confirm with Stripe and fulfill if paid.
    if (order.status !== 'paid') {
      try {
        const stripe = await getStripe();
        const pi = await stripe.paymentIntents.retrieve(req.params.piId);
        if (pi.status === 'succeeded' && pi.metadata?.order_id) {
          await fulfillAndNotify({ metadata: pi.metadata, payment_intent: pi.id, id: null, shipping_details: pi.shipping ?? null });
          order = (await query(
            `SELECT id, order_number, status, total_cents, currency FROM orders WHERE id = $1`,
            [order.id],
          )).rows[0];
        }
      } catch (e) { console.error('Intent confirm fallback failed:', e.message); }
    }

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
      order: { orderNumber: order.order_number, status: order.status, totalCents: order.total_cents, currency: order.currency },
      tickets,
    });
  }),
);

const storeSchema = z.object({
  items: z.array(z.object({ variantId: z.string().uuid(), quantity: z.number().int().min(1).max(50) })).min(1),
  customer: z.object({
    name: z.string().min(1).max(200),
    email: z.string().email(),
    phone: z.string().max(40).optional(),
  }),
  // How physical goods are delivered: picked up at the show (free) or shipped
  // (buyer pays a flat per-order fee). Ignored for digital-only carts.
  delivery: z.enum(['pickup', 'ship']).optional(),
  // Destination region for the flat shipping fee (only when delivery === 'ship').
  shipTo: z.enum(['domestic', 'canada', 'uk', 'world']).optional(),
});

// Stripe needs an explicit allowed-country list; map our region → countries.
const REGION_COUNTRIES = {
  domestic: ['US'],
  canada: ['CA'],
  uk: ['GB'],
  world: ['AU', 'NZ', 'IE', 'DE', 'FR', 'IT', 'ES', 'NL', 'SE', 'NO', 'DK', 'JP', 'MX', 'BR'],
};

// POST /checkout/store/intent — on-site (white-label) store checkout. Creates a
// PaymentIntent; the branded Payment Element collects payment + shipping on our
// page. Shipping is attached client-side via the Address Element and lands on
// pi.shipping, which fulfillment persists.
checkoutRouter.post(
  '/store/intent',
  formLimiter,
  asyncHandler(async (req, res) => {
    const { items, customer, delivery, shipTo } = storeSchema.parse(req.body);
    subscribeEmail(customer.email, { name: customer.name, source: 'store-purchase' }).catch(() => {});
    const stripe = await getStripe();
    const computed = await computeStoreOrder(items, delivery, shipTo);
    const order = await createPendingStoreOrder({ customer, computed });
    const intent = await stripe.paymentIntents.create({
      amount: computed.totalCents,
      currency: computed.currency,
      automatic_payment_methods: { enabled: true },
      receipt_email: customer.email,
      description: `Shop order — ${order.order_number}`,
      metadata: { order_id: order.id, order_number: order.order_number, kind: 'store' },
    });
    await query(`UPDATE orders SET stripe_payment_intent = $2 WHERE id = $1`, [order.id, intent.id]);
    res.json({
      clientSecret: intent.client_secret,
      orderNumber: order.order_number,
      amountCents: computed.totalCents,
      subtotalCents: computed.subtotalCents,
      shippingCents: computed.shippingCents,
      deliveryMethod: computed.deliveryMethod,
      shipRegion: computed.shipRegion,
      currency: computed.currency,
    });
  }),
);

// POST /checkout/store — store cart -> Stripe Checkout. Prices server-side,
// checks inventory, and collects a shipping address for physical goods (§10).
checkoutRouter.post(
  '/store',
  formLimiter,
  asyncHandler(async (req, res) => {
    const { items, customer, delivery, shipTo } = storeSchema.parse(req.body);
    subscribeEmail(customer.email, { name: customer.name, source: 'store-purchase' }).catch(() => {});
    const stripe = await getStripe();
    const computed = await computeStoreOrder(items, delivery, shipTo);
    const order = await createPendingStoreOrder({ customer, computed });

    const lineItems = computed.lines.map((l) => ({
      quantity: l.quantity,
      price_data: {
        currency: computed.currency,
        unit_amount: l.unitPriceCents,
        product_data: { name: l.name },
      },
    }));
    // Shipping as its own line so the Stripe total matches the order total.
    if (computed.shippingCents > 0) {
      lineItems.push({
        quantity: 1,
        price_data: { currency: computed.currency, unit_amount: computed.shippingCents, product_data: { name: 'Shipping' } },
      });
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      customer_email: customer.email,
      // Only ask for an address when something is actually being shipped, and
      // restrict it to the chosen destination region.
      ...(computed.deliveryMethod === 'ship'
        ? { shipping_address_collection: { allowed_countries: REGION_COUNTRIES[computed.shipRegion] || REGION_COUNTRIES.domestic } }
        : {}),
      line_items: lineItems,
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
    subscribeEmail(vendor.email, { name: vendor.name, source: 'booth-purchase' }).catch(() => {});
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
          [`FFF-${Date.now().toString(36).toUpperCase()}-${randomToken(2).toUpperCase()}`,
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
    let order = rows[0];
    if (!order) throw notFound('Order not found');

    // Don't wait on the webhook — confirm with Stripe and fulfill if paid.
    if (order.status !== 'paid') {
      try {
        const stripe = await getStripe();
        const s = await stripe.checkout.sessions.retrieve(req.params.sessionId);
        if (s.payment_status === 'paid' && s.metadata?.order_id) {
          await fulfillAndNotify({ metadata: s.metadata, payment_intent: s.payment_intent, id: s.id, shipping_details: s.shipping_details ?? null });
          order = (await query(
            `SELECT id, order_number, status, total_cents, currency, customer_email FROM orders WHERE id = $1`,
            [order.id],
          )).rows[0];
        }
      } catch (e) { console.error('Session confirm fallback failed:', e.message); }
    }

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
