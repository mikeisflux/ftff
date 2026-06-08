import { Router } from 'express';
import QRCode from 'qrcode';
import { query } from '../db/pool.js';
import { env } from '../config/env.js';
import { asyncHandler, notFound } from '../lib/http.js';

// Public mobile ticket page data (§8). The QR encodes the opaque validation URL
// (https://<site>/t/<token>) — not enumerable. Returns an inline QR data URL so
// the ticket renders as a wallet-friendly page without extra requests.
export const ticketRouter = Router();

ticketRouter.get(
  '/:token',
  asyncHandler(async (req, res) => {
    const { rows } = await query(
      `SELECT t.qr_token, t.attendee_name, t.status, t.checked_in_at,
              tt.name AS ticket_name, tt.is_digital,
              o.order_number, o.customer_name
         FROM tickets t
         JOIN ticket_types tt ON tt.id = t.ticket_type_id
         JOIN orders o ON o.id = t.order_id
        WHERE t.qr_token = $1`,
      [req.params.token],
    );
    const ticket = rows[0];
    if (!ticket) throw notFound('Ticket not found');

    const validationUrl = `${env.PUBLIC_URL}/t/${ticket.qr_token}`;
    const qrDataUrl = await QRCode.toDataURL(validationUrl, { margin: 1, width: 320 });

    res.json({
      ticket: {
        ticketName: ticket.ticket_name,
        attendeeName: ticket.attendee_name || ticket.customer_name,
        orderNumber: ticket.order_number,
        status: ticket.status,
        isDigital: ticket.is_digital,
        checkedInAt: ticket.checked_in_at,
        qr: qrDataUrl,
      },
    });
  }),
);
