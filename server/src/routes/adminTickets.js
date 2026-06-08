import { Router } from 'express';
import { z } from 'zod';
import { query } from '../db/pool.js';
import { asyncHandler, notFound } from '../lib/http.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { audit } from '../lib/audit.js';
import { sendTicketDelivery } from '../lib/email.js';

// Admin ticket dashboard (§8): search, live check-in counts, manual check-in,
// void, and resend delivery email.
export const adminTicketsRouter = Router();

adminTicketsRouter.use(requireAuth, requireRole('admin'));

// GET /admin/tickets/stats — live counts for the dashboard.
adminTicketsRouter.get(
  '/stats',
  asyncHandler(async (_req, res) => {
    const totals = (
      await query(
        `SELECT count(*)::int AS issued,
                count(*) FILTER (WHERE status = 'checked_in')::int AS checked_in,
                count(*) FILTER (WHERE status = 'void')::int AS void
           FROM tickets`,
      )
    ).rows[0];
    const byType = (
      await query(
        `SELECT tt.name, tt.code,
                count(t.*)::int AS issued,
                count(t.*) FILTER (WHERE t.status = 'checked_in')::int AS checked_in
           FROM ticket_types tt
           LEFT JOIN tickets t ON t.ticket_type_id = tt.id
          GROUP BY tt.id ORDER BY tt.sort_order`,
      )
    ).rows;
    res.json({ totals, byType });
  }),
);

// GET /admin/tickets?q=...&limit=&offset= — search by order#, email, token, name.
adminTicketsRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const offset = Math.max(Number(req.query.offset) || 0, 0);

    const params = [];
    let where = '';
    if (q) {
      params.push(`%${q}%`, q);
      where = `WHERE o.order_number ILIKE $1 OR o.customer_email ILIKE $1
                  OR t.attendee_name ILIKE $1 OR t.qr_token = $2`;
    }
    params.push(limit, offset);
    const { rows } = await query(
      `SELECT t.id, t.qr_token, t.status, t.attendee_name, t.checked_in_at,
              tt.name AS ticket_name, o.order_number, o.customer_email, o.customer_name
         FROM tickets t
         JOIN ticket_types tt ON tt.id = t.ticket_type_id
         JOIN orders o ON o.id = t.order_id
         ${where}
        ORDER BY t.created_at DESC
        LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    );
    res.json({ tickets: rows });
  }),
);

const idSchema = z.object({ id: z.string().uuid() });

// POST /admin/tickets/:id/checkin — manual check-in (atomic, single-use).
adminTicketsRouter.post(
  '/:id/checkin',
  asyncHandler(async (req, res) => {
    const { id } = idSchema.parse(req.params);
    const upd = await query(
      `UPDATE tickets SET status = 'checked_in', checked_in_at = now(), checked_in_by = $2
        WHERE id = $1 AND status = 'valid' RETURNING id, checked_in_at`,
      [id, req.user.id],
    );
    if (upd.rowCount === 0) {
      const cur = await query(`SELECT status FROM tickets WHERE id = $1`, [id]);
      if (!cur.rows[0]) throw notFound('Ticket not found');
      return res.json({ ok: false, status: cur.rows[0].status });
    }
    await audit(req.user.id, 'ticket.checkin.manual', { entity: 'ticket', entityId: id });
    res.json({ ok: true, checkedInAt: upd.rows[0].checked_in_at });
  }),
);

// POST /admin/tickets/:id/void — invalidate a ticket.
adminTicketsRouter.post(
  '/:id/void',
  asyncHandler(async (req, res) => {
    const { id } = idSchema.parse(req.params);
    const upd = await query(
      `UPDATE tickets SET status = 'void' WHERE id = $1 RETURNING id`,
      [id],
    );
    if (upd.rowCount === 0) throw notFound('Ticket not found');
    await audit(req.user.id, 'ticket.void', { entity: 'ticket', entityId: id });
    res.json({ ok: true });
  }),
);

// POST /admin/tickets/:id/resend — re-send the order's ticket delivery email.
adminTicketsRouter.post(
  '/:id/resend',
  asyncHandler(async (req, res) => {
    const { id } = idSchema.parse(req.params);
    const { rows } = await query(
      `SELECT o.* FROM orders o JOIN tickets t ON t.order_id = o.id WHERE t.id = $1`,
      [id],
    );
    const order = rows[0];
    if (!order) throw notFound('Ticket not found');
    const result = await sendTicketDelivery(order);
    await audit(req.user.id, 'ticket.resend', { entity: 'order', entityId: order.id });
    res.json({ ok: true, email: result });
  }),
);
