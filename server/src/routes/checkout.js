import { Router } from 'express';
import { z } from 'zod';
import { query } from '../db/pool.js';
import { env } from '../config/env.js';
import { asyncHandler, notFound } from '../lib/http.js';
import { formLimiter } from '../middleware/rateLimit.js';
import { getStripe } from '../lib/stripe.js';
import { computeTicketOrder, createPendingTicketOrder } from '../lib/orders.js';

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
