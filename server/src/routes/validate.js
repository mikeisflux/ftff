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
