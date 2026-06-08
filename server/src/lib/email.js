import sgMail from '@sendgrid/mail';
import { query } from '../db/pool.js';
import { env } from '../config/env.js';
import { getSettingValue } from './settings.js';

// Outbound email via SendGrid (§12). Config-gated: if SendGrid isn't set up in
// the Settings panel yet, sends are skipped gracefully (never throws into the
// caller) so fulfillment is unaffected. Becomes live the moment keys are saved.

export async function sendEmail({ to, subject, html, text }) {
  const apiKey = await getSettingValue('sendgrid.api_key');
  const from = await getSettingValue('sendgrid.from_address');
  if (!apiKey || !from) return { skipped: true, reason: 'sendgrid_unconfigured' };
  const fromName = await getSettingValue('sendgrid.from_name');

  sgMail.setApiKey(apiKey);
  await sgMail.send({
    to,
    from: fromName ? { email: from, name: fromName } : from,
    subject,
    html,
    ...(text ? { text } : {}),
  });
  return { sent: true };
}

// Ticket delivery email (§8 step 4): one mobile-ticket link per issued ticket.
export async function sendTicketDelivery(order) {
  if (!order?.customer_email) return { skipped: true, reason: 'no_recipient' };

  const { rows: tickets } = await query(
    `SELECT t.qr_token, tt.name AS ticket_name
       FROM tickets t JOIN ticket_types tt ON tt.id = t.ticket_type_id
      WHERE t.order_id = $1 ORDER BY t.created_at`,
    [order.id],
  );
  if (tickets.length === 0) return { skipped: true, reason: 'no_tickets' };

  const links = tickets
    .map(
      (t) =>
        `<li style="margin:6px 0"><strong>${t.ticket_name}</strong> — ` +
        `<a href="${env.PUBLIC_URL}/t/${t.qr_token}">View / show at the door</a></li>`,
    )
    .join('');
  const html =
    `<h1>Your tickets are ready</h1>` +
    `<p>Order <strong>${order.order_number}</strong></p>` +
    `<ul>${links}</ul>` +
    `<p>Open each link on your phone — the QR code is scanned for entry.</p>`;
  const text =
    `Your tickets (Order ${order.order_number}):\n` +
    tickets.map((t) => `- ${t.ticket_name}: ${env.PUBLIC_URL}/t/${t.qr_token}`).join('\n');

  return sendEmail({
    to: order.customer_email,
    subject: `Your tickets — ${order.order_number}`,
    html,
    text,
  });
}
