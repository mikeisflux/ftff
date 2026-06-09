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

// Order/ticket delivery email (§8 step 4). Physical tickets get scannable QR
// links; Digital tickets get the confirmation number + LIVE access instructions
// (no QR — they log in to the stream with confirmation number + email).
export async function sendTicketDelivery(order) {
  if (!order?.customer_email) return { skipped: true, reason: 'no_recipient' };

  const { rows: tickets } = await query(
    `SELECT t.qr_token, tt.name AS ticket_name
       FROM tickets t JOIN ticket_types tt ON tt.id = t.ticket_type_id
      WHERE t.order_id = $1 ORDER BY t.created_at`,
    [order.id],
  );
  const { rows: dig } = await query(
    `SELECT 1 FROM order_items oi JOIN ticket_types tt ON tt.id = oi.ticket_type_id
      WHERE oi.order_id = $1 AND tt.is_digital = TRUE LIMIT 1`,
    [order.id],
  );
  const hasDigital = dig.length > 0;
  if (tickets.length === 0 && !hasDigital) return { skipped: true, reason: 'no_tickets' };

  let html = `<h1>Your order is confirmed</h1>` +
    `<p>Confirmation number: <strong>${order.order_number}</strong></p>`;
  let text = `Your order is confirmed.\nConfirmation number: ${order.order_number}\n`;

  if (tickets.length > 0) {
    const links = tickets
      .map((t) => `<li style="margin:6px 0"><strong>${t.ticket_name}</strong> — <a href="${env.PUBLIC_URL}/t/${t.qr_token}">View / show at the door</a></li>`)
      .join('');
    html += `<h2>Your tickets</h2><ul>${links}</ul><p>Open each on your phone — the QR code is scanned at entry.</p>`;
    text += `\nTickets:\n` + tickets.map((t) => `- ${t.ticket_name}: ${env.PUBLIC_URL}/t/${t.qr_token}`).join('\n') + '\n';
  }
  if (hasDigital) {
    html += `<h2>Virtual Con — LIVE</h2>` +
      `<p>Your Digital ticket includes livestream access. When the show is live, go to ` +
      `<a href="${env.PUBLIC_URL}/virtual">${env.PUBLIC_URL.replace(/^https?:\/\//, '')}/virtual</a> ` +
      `and sign in with your <strong>confirmation number</strong> (${order.order_number}) and this email address.</p>`;
    text += `\nVirtual Con (LIVE): ${env.PUBLIC_URL}/virtual — sign in with confirmation number ${order.order_number} + this email.\n`;
  }

  return sendEmail({
    to: order.customer_email,
    subject: `Your order is confirmed — ${order.order_number}`,
    html,
    text,
  });
}

const money = (cents, cur = 'usd') =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: cur.toUpperCase() }).format((cents || 0) / 100);

// Booth purchase confirmation (§9).
export async function sendBoothConfirmation(order) {
  if (!order?.customer_email) return { skipped: true, reason: 'no_recipient' };
  const { rows } = await query(
    `SELECT b.label, b.zone FROM booths b WHERE b.order_id = $1`,
    [order.id],
  );
  const booth = rows[0];
  const html =
    `<h1>Your booth is confirmed</h1>` +
    `<p>Order <strong>${order.order_number}</strong></p>` +
    (booth ? `<p>Booth <strong>${booth.label}</strong>${booth.zone ? ` — ${booth.zone}` : ''}</p>` : '') +
    `<p>Total paid: ${money(order.total_cents, order.currency)}</p>` +
    `<p>Our exhibitor team will follow up with move-in details.</p>`;
  return sendEmail({
    to: order.customer_email,
    subject: `Booth confirmed — ${order.order_number}`,
    html,
  });
}

// Form submissions: notify the admin inbox + confirm to the submitter (§7.2).
export async function notifyAdminOfSubmission({ kind, name, email, subject, message }) {
  const to = await getSettingValue('sendgrid.from_address');
  if (!to) return { skipped: true, reason: 'sendgrid_unconfigured' };
  const html =
    `<h2>New ${kind} submission</h2>` +
    `<p><strong>${name || 'Unknown'}</strong> &lt;${email || 'n/a'}&gt;</p>` +
    (subject ? `<p>Subject: ${subject}</p>` : '') +
    `<p>${(message || '').replace(/</g, '&lt;')}</p>`;
  return sendEmail({ to, subject: `New ${kind}: ${subject || name || email || ''}`.slice(0, 120), html });
}

// Newsletter double opt-in confirmation (§7.2).
export async function sendNewsletterConfirm(email, token) {
  if (!email) return { skipped: true, reason: 'no_recipient' };
  const confirmUrl = `${env.PUBLIC_URL}/api/v1/newsletter/confirm?token=${encodeURIComponent(token)}`;
  const unsubUrl = `${env.PUBLIC_URL}/api/v1/newsletter/unsubscribe?token=${encodeURIComponent(token)}`;
  const html =
    `<h2>Confirm your subscription</h2>` +
    `<p>Tap below to start getting show news, guest reveals, and ticket alerts.</p>` +
    `<p><a href="${confirmUrl}" style="display:inline-block;padding:10px 18px;background:#7c3aed;color:#fff;border-radius:8px;text-decoration:none">Confirm subscription</a></p>` +
    `<p style="font-size:12px;color:#666">If you didn't request this, ignore this email or <a href="${unsubUrl}">unsubscribe</a>.</p>`;
  return sendEmail({ to: email, subject: 'Confirm your subscription', html });
}

export async function confirmSubmission({ email, name, kind }) {
  if (!email) return { skipped: true, reason: 'no_recipient' };
  const html =
    `<h2>Thanks, ${name || 'there'}!</h2>` +
    `<p>We received your ${kind} and will be in touch.</p>`;
  return sendEmail({ to: email, subject: 'We received your message', html });
}

// Generic order confirmation (store, §10).
export async function sendOrderConfirmation(order) {
  if (!order?.customer_email) return { skipped: true, reason: 'no_recipient' };
  const { rows: items } = await query(
    `SELECT description, quantity, unit_price_cents FROM order_items WHERE order_id=$1`,
    [order.id],
  );
  const li = items
    .map((i) => `<li>${i.quantity} × ${i.description || 'Item'} — ${money(i.unit_price_cents, order.currency)}</li>`)
    .join('');
  const html =
    `<h1>Order confirmed</h1>` +
    `<p>Order <strong>${order.order_number}</strong></p>` +
    `<ul>${li}</ul>` +
    `<p>Total: ${money(order.total_cents, order.currency)}</p>`;
  return sendEmail({ to: order.customer_email, subject: `Order confirmed — ${order.order_number}`, html });
}
