import { Router } from 'express';
import { z } from 'zod';
import { query } from '../db/pool.js';
import { asyncHandler, notFound, badRequest } from '../lib/http.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { getStripe } from '../lib/stripe.js';
import { audit } from '../lib/audit.js';

// Admin order management (§10, §15): list, view items + shipping, mark
// fulfillment, and refund via Stripe.
export const adminOrdersRouter = Router();
adminOrdersRouter.use(requireAuth, requireRole('admin'));

// GET /admin/orders?kind=&status=
adminOrdersRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const where = [];
    const params = [];
    for (const f of ['kind', 'status']) {
      if (typeof req.query[f] === 'string' && req.query[f]) {
        params.push(req.query[f]);
        where.push(`${f} = $${params.length}`);
      }
    }
    const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const { rows } = await query(
      `SELECT id, order_number, customer_name, customer_email, kind, total_cents,
              currency, status, fulfillment_status, shipping_address, paid_at, created_at
         FROM orders ${clause} ORDER BY created_at DESC LIMIT 200`,
      params,
    );
    res.json({ orders: rows });
  }),
);

// GET /admin/orders/:id — with line items.
adminOrdersRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const { rows } = await query(`SELECT * FROM orders WHERE id=$1`, [req.params.id]);
    const order = rows[0];
    if (!order) throw notFound('Order not found');
    const items = (await query(`SELECT * FROM order_items WHERE order_id=$1`, [order.id])).rows;
    res.json({ order, items });
  }),
);

const fulfillSchema = z.object({ status: z.enum(['unfulfilled', 'fulfilled', 'shipped', 'cancelled']) });

// POST /admin/orders/:id/fulfillment
adminOrdersRouter.post(
  '/:id/fulfillment',
  asyncHandler(async (req, res) => {
    const { status } = fulfillSchema.parse(req.body);
    const { rows } = await query(
      `UPDATE orders SET fulfillment_status=$2 WHERE id=$1 RETURNING id, fulfillment_status`,
      [req.params.id, status],
    );
    if (!rows[0]) throw notFound('Order not found');
    await audit(req.user.id, 'order.fulfillment', { entity: 'order', entityId: req.params.id, meta: { status } });
    res.json({ ok: true, order: rows[0] });
  }),
);

// POST /admin/orders/:id/refund — full refund via Stripe, reflect status back.
adminOrdersRouter.post(
  '/:id/refund',
  asyncHandler(async (req, res) => {
    const { rows } = await query(
      `SELECT id, status, stripe_payment_intent FROM orders WHERE id=$1`,
      [req.params.id],
    );
    const order = rows[0];
    if (!order) throw notFound('Order not found');
    if (order.status !== 'paid') throw badRequest('Only paid orders can be refunded');
    if (!order.stripe_payment_intent) throw badRequest('No payment intent on order');

    const stripe = await getStripe();
    await stripe.refunds.create({ payment_intent: order.stripe_payment_intent });
    await query(`UPDATE orders SET status='refunded' WHERE id=$1`, [order.id]);
    await audit(req.user.id, 'order.refund', { entity: 'order', entityId: order.id });
    res.json({ ok: true });
  }),
);
