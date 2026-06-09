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

// POST /validate -> { result, ticket }
validateRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const { qr_token } = bodySchema.parse(req.body);

    // Atomic claim: only succeeds if the ticket is currently valid.
    const claim = await query(
      `UPDATE tickets SET status = 'checked_in', checked_in_at = now(), checked_in_by = $2
        WHERE qr_token = $1 AND status = 'valid'
        RETURNING id, checked_in_at`,
      [qr_token, req.user.id],
    );

    // Always load context for the response (name/type), regardless of outcome.
    const ctx = await query(
      `SELECT t.status, t.checked_in_at, t.attendee_name,
              tt.name AS ticket_name, o.order_number, o.customer_name
         FROM tickets t
         JOIN ticket_types tt ON tt.id = t.ticket_type_id
         JOIN orders o ON o.id = t.order_id
        WHERE t.qr_token = $1`,
      [qr_token],
    );
    const t = ctx.rows[0];

    if (!t) {
      return res.status(404).json({ result: 'not_found' });
    }

    const ticket = {
      ticketName: t.ticket_name,
      attendeeName: t.attendee_name || t.customer_name,
      orderNumber: t.order_number,
      checkedInAt: t.checked_in_at,
    };

    if (claim.rowCount === 1) {
      await audit(req.user.id, 'ticket.checkin', { entity: 'ticket', entityId: qr_token });
      return res.json({ result: 'checked_in', ticket });
    }
    if (t.status === 'checked_in') {
      return res.json({ result: 'already_checked_in', ticket });
    }
    return res.json({ result: 'void', ticket });
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
              tt.name AS ticket_name, o.order_number, o.customer_name
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
        attendeeName: r.attendee_name || r.customer_name,
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
