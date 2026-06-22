import { Router } from 'express';
import { z } from 'zod';
import { query } from '../db/pool.js';
import { asyncHandler } from '../lib/http.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { audit } from '../lib/audit.js';

// Door-staff ticket validation (§8). Single-use, atomic check-in: the guarded
// UPDATE (status='valid' predicate) makes concurrent scans race-safe — only one
// can transition valid→checked_in. The server is the source of truth.
export const validateRouter = Router();

validateRouter.use(requireAuth, requireRole('door_staff', 'admin'));

const bodySchema = z.object({ qr_token: z.string().min(8).max(128) });

// POST /validate -> { result, order } — a QR represents the whole purchase
// (group). Scanning it checks in every still-valid PHYSICAL ticket on that order
// at once and returns the quantity + types so door staff can verify the group.
// Digital tickets are virtual-access only and are never door-checked-in here.
validateRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const { qr_token } = bodySchema.parse(req.body);

    const found = await query(`SELECT order_id FROM tickets WHERE qr_token = $1`, [qr_token]);
    if (!found.rows[0]) return res.status(404).json({ result: 'not_found' });
    const orderId = found.rows[0].order_id;

    // Atomically check in all valid, non-digital tickets on this order.
    const claim = await query(
      `UPDATE tickets t SET status = 'checked_in', checked_in_at = now(), checked_in_by = $2
         FROM ticket_types tt
        WHERE t.ticket_type_id = tt.id AND t.order_id = $1
          AND t.status = 'valid' AND tt.is_digital = FALSE
        RETURNING t.id`,
      [orderId, req.user.id],
    );
    const admitted = claim.rowCount;

    const bd = await query(
      `SELECT tt.name AS ticket_name, tt.is_digital,
              count(*)::int AS total,
              count(*) FILTER (WHERE t.status = 'checked_in')::int AS checked_in
         FROM tickets t JOIN ticket_types tt ON tt.id = t.ticket_type_id
        WHERE t.order_id = $1
        GROUP BY tt.name, tt.is_digital
        ORDER BY tt.is_digital, tt.name`,
      [orderId],
    );
    const o = (await query(`SELECT order_number, customer_name FROM orders WHERE id = $1`, [orderId])).rows[0];

    const physical = bd.rows.filter((r) => !r.is_digital);
    const totalPhysical = physical.reduce((n, r) => n + r.total, 0);
    const checkedPhysical = physical.reduce((n, r) => n + r.checked_in, 0);
    const hasDigital = bd.rows.some((r) => r.is_digital);

    let result;
    if (admitted > 0) result = 'checked_in';
    else if (totalPhysical === 0 && hasDigital) result = 'digital';
    else if (totalPhysical > 0 && checkedPhysical >= totalPhysical) result = 'already_checked_in';
    else result = 'void';

    if (admitted > 0) {
      await audit(req.user.id, 'ticket.checkin', { entity: 'order', entityId: orderId, meta: { admitted } });
    }

    res.json({
      result,
      admitted,
      order: {
        orderNumber: o?.order_number,
        customerName: o?.customer_name,
        totalPhysical,
        checkedPhysical,
        breakdown: bd.rows.map((r) => ({ ticketName: r.ticket_name, isDigital: r.is_digital, total: r.total, checkedIn: r.checked_in })),
      },
    });
  }),
);

// GET /validate/manifest — download valid/checked-in tickets for OFFLINE
// validation (§8). The door app caches this and validates locally when the
// venue wifi is flaky, queuing check-ins to sync later.
validateRouter.get(
  '/manifest',
  asyncHandler(async (req, res) => {
    const { rows } = await query(
      `SELECT t.qr_token, t.status, t.checked_in_at, t.attendee_name,
              tt.name AS ticket_name, tt.is_digital,
              o.id AS order_id, o.order_number, o.customer_name
         FROM tickets t
         JOIN ticket_types tt ON tt.id = t.ticket_type_id
         JOIN orders o ON o.id = t.order_id
        WHERE t.status IN ('valid','checked_in')
        ORDER BY t.created_at`,
    );
    res.set('Cache-Control', 'no-store');
    res.json({
      generatedAt: new Date().toISOString(),
      tickets: rows.map((r) => ({
        qr_token: r.qr_token,
        status: r.status,
        checkedInAt: r.checked_in_at,
        ticketName: r.ticket_name,
        isDigital: r.is_digital,
        attendeeName: r.attendee_name || r.customer_name,
        orderId: r.order_id,
        orderNumber: r.order_number,
      })),
    });
  }),
);

// POST /validate/batch — sync queued offline check-ins (§8). Each is applied
// atomically (single-use); the client-supplied scan time is preserved. Returns
// a per-token result so the device can surface conflicts.
const batchSchema = z.object({
  checkins: z
    .array(z.object({ qr_token: z.string().min(8).max(128), at: z.string().datetime().optional() }))
    .max(5000),
});
validateRouter.post(
  '/batch',
  asyncHandler(async (req, res) => {
    const { checkins } = batchSchema.parse(req.body);
    const results = [];
    for (const c of checkins) {
      // eslint-disable-next-line no-await-in-loop
      const claim = await query(
        `UPDATE tickets SET status='checked_in',
                checked_in_at = COALESCE($2::timestamptz, now()), checked_in_by=$3
          WHERE qr_token=$1 AND status='valid'
          RETURNING checked_in_at`,
        [c.qr_token, c.at ?? null, req.user.id],
      );
      if (claim.rowCount === 1) {
        results.push({ qr_token: c.qr_token, result: 'checked_in', checkedInAt: claim.rows[0].checked_in_at });
        continue;
      }
      // eslint-disable-next-line no-await-in-loop
      const cur = await query(`SELECT status, checked_in_at FROM tickets WHERE qr_token=$1`, [c.qr_token]);
      if (!cur.rows[0]) results.push({ qr_token: c.qr_token, result: 'not_found' });
      else if (cur.rows[0].status === 'checked_in') results.push({ qr_token: c.qr_token, result: 'already_checked_in', checkedInAt: cur.rows[0].checked_in_at });
      else results.push({ qr_token: c.qr_token, result: 'void' });
    }
    await audit(req.user.id, 'ticket.checkin.batch', { entity: 'ticket', meta: { count: checkins.length } });
    res.json({ results });
  }),
);
