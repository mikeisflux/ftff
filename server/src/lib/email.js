import sgMail from '@sendgrid/mail';
import { query } from '../db/pool.js';
import { env } from '../config/env.js';
import { getSettingValue } from './settings.js';
import { renderEmailDocument, inlineEmailStyles } from './emailLayout.js';

// Outbound email via SendGrid (§12). Config-gated: if SendGrid isn't set up in
// the Settings panel yet, sends are skipped gracefully (never throws into the
// caller) so fulfillment is unaffected. Becomes live the moment keys are saved.

export async function sendEmail({ to, subject, html, text, log = true }) {
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

  // Record outbound system mail in the admin Mail "Sent" folder so transactional
  // emails (vendor confirmations, payment requests, tickets, etc.) are visible
  // alongside hand-composed mail. Best-effort: never fail a real send over this.
  // Callers that keep their own Sent record (admin composer) or send in bulk
  // (campaigns) pass log:false.
  if (log) {
    try {
      const snippet = (text || html || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 160);
      await query(
        `INSERT INTO email_messages
           (folder, direction, from_email, from_name, to_emails, subject, snippet, body_html, body_text, is_read)
         VALUES ('sent','outbound',$1,$2,$3,$4,$5,$6,$7,TRUE)`,
        [from, fromName ?? null, JSON.stringify(Array.isArray(to) ? to : [to]),
          subject, snippet, html ?? null, text ?? null],
      );
    } catch { /* logging is best-effort */ }
  }
  return { sent: true };
}

// Order/ticket delivery email (§8 step 4). Physical tickets get scannable QR
// links; Digital tickets get the confirmation number + LIVE access instructions
// (no QR — they log in to the stream with confirmation number + email).
export async function sendTicketDelivery(order) {
  if (!order?.customer_email) return { skipped: true, reason: 'no_recipient' };

  const { rows: tickets } = await query(
    `SELECT t.qr_token, tt.name AS ticket_name, tt.is_digital
       FROM tickets t JOIN ticket_types tt ON tt.id = t.ticket_type_id
      WHERE t.order_id = $1 ORDER BY t.created_at`,
    [order.id],
  );
  const physical = tickets.filter((t) => !t.is_digital);
  const hasDigital = tickets.some((t) => t.is_digital);
  if (tickets.length === 0) return { skipped: true, reason: 'no_tickets' };

  let content = `<p>Thanks! Your order is confirmed.</p>` +
    `<p>Confirmation number: <strong>${order.order_number}</strong></p>`;
  let text = `Your order is confirmed.\nConfirmation number: ${order.order_number}\n`;

  if (physical.length > 0) {
    // One QR for the whole order — scanning it checks the group in at the door.
    const groupToken = physical[0].qr_token;
    const qrImg = `${env.PUBLIC_URL}/api/v1/t/${groupToken}/qr.png`;
    const ticketUrl = `${env.PUBLIC_URL}/t/${groupToken}`;
    const counts = {};
    for (const t of physical) counts[t.ticket_name] = (counts[t.ticket_name] || 0) + 1;
    const lines = Object.entries(counts).map(([n, q]) => `<li>${q} × ${n}</li>`).join('');

    content += `<h2>Your tickets</h2><ul>${lines}</ul>` +
      `<div style="text-align:center;margin:18px 0;padding:18px;border:1px solid #e3e3ea;border-radius:10px">` +
      `<p style="margin:0 0 10px;font-weight:700">Show this QR code at the door</p>` +
      `<img src="${qrImg}" width="220" height="220" alt="Check-in QR code" style="width:220px;height:220px;display:block;margin:0 auto 10px"/>` +
      `<a href="${ticketUrl}">Open your mobile ticket</a></div>` +
      `<p>One scan checks in your whole group (${physical.length} ${physical.length === 1 ? 'ticket' : 'tickets'}).</p>`;
    text += `\nTickets:\n` + Object.entries(counts).map(([n, q]) => `- ${q} x ${n}`).join('\n') +
      `\nShow your QR at the door: ${ticketUrl}\n`;
  }
  if (hasDigital) {
    content += `<h2>Virtual Con — LIVE</h2>` +
      `<p>Your Digital ticket includes livestream access. When the show is live, go to ` +
      `<a href="${env.PUBLIC_URL}/virtual">${env.PUBLIC_URL.replace(/^https?:\/\//, '')}/virtual</a> ` +
      `and sign in with your <strong>confirmation number</strong> (${order.order_number}) and this email address.</p>`;
    text += `\nVirtual Con (LIVE): ${env.PUBLIC_URL}/virtual — sign in with confirmation number ${order.order_number} + this email.\n`;
  }

  return sendEmail({
    to: order.customer_email,
    subject: `Your order is confirmed — ${order.order_number}`,
    html: renderEmailDocument({ title: `Your order — ${order.order_number}`, contentHtml: inlineEmailStyles(content) }),
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

// ── Exhibitor (Become an Exhibitor) emails ──────────────────────────────────
const CHECK_PAYEE = 'Undeniable Ventures';
const CHECK_ADDRESS = '6 Pilgrim Drive, Succasunna, NJ 07876';

function exhibitorBreakdownHtml(app) {
  const items = Array.isArray(app.breakdown) ? app.breakdown : [];
  if (items.length === 0) return '';
  const rows = items
    .map((l) => `<li>${l.qty} × ${l.label} — ${money(l.amountCents)}</li>`)
    .join('');
  return `<ul>${rows}</ul>`;
}

// Vendor chose to pay by check — application is held pending the check arriving.
export async function sendExhibitorCheckReceived(app, { choice, booth, amountCents }) {
  if (!app?.contact_email) return { skipped: true, reason: 'no_recipient' };
  const due = choice === 'deposit' ? 'deposit' : 'full amount';
  const html =
    `<h1>We received your exhibitor application</h1>` +
    `<p>Reference <strong>${app.reference}</strong>${booth ? ` · Booth <strong>${booth.label}</strong>` : ''}</p>` +
    exhibitorBreakdownHtml(app) +
    `<p>Order total: <strong>${money(app.total_cents)}</strong>. You chose to pay the ${due} by check: ` +
    `<strong>${money(amountCents)}</strong>.</p>` +
    `<p>Please make your check or money order payable to <strong>${CHECK_PAYEE}</strong> and mail to:<br>${CHECK_ADDRESS}</p>` +
    `<p>Your booth is held for you. We'll confirm your space once payment is received.</p>`;
  return sendEmail({ to: app.contact_email, subject: `Exhibitor application received — ${app.reference}`, html });
}

// Notify the admin inbox of a new exhibitor application reaching checkout.
export async function notifyAdminOfExhibitor(app, { choice, method, booth }) {
  const to = await getSettingValue('sendgrid.from_address');
  if (!to) return { skipped: true, reason: 'sendgrid_unconfigured' };
  const html =
    `<h2>New exhibitor checkout (${method}, ${choice})</h2>` +
    `<p><strong>${app.vendor_name}</strong> &lt;${app.contact_email}&gt;${booth ? ` · Booth ${booth.label}` : ''}</p>` +
    `<p>Total ${money(app.total_cents)} · Deposit ${money(app.deposit_cents)}</p>` +
    exhibitorBreakdownHtml(app);
  return sendEmail({ to, subject: `Exhibitor: ${app.vendor_name} (${app.reference})`, html });
}

// Card payment confirmed (deposit or full).
export async function sendExhibitorPaymentConfirmation(app, _phase) {
  if (!app?.contact_email) return { skipped: true, reason: 'no_recipient' };
  const balanceNote =
    app.balance_cents > 0
      ? `<p>You paid a deposit of <strong>${money(app.amount_paid_cents)}</strong>. A balance of ` +
        `<strong>${money(app.balance_cents)}</strong> will be due before the show — we'll email you a payment link in advance.</p>`
      : `<p>Paid in full: <strong>${money(app.amount_paid_cents)}</strong>. You're all set!</p>`;
  const html =
    `<h1>Payment received — you're confirmed</h1>` +
    `<p>Reference <strong>${app.reference}</strong></p>` +
    exhibitorBreakdownHtml(app) +
    `<p>Order total: ${money(app.total_cents)}</p>` +
    balanceNote +
    `<p>Our exhibitor team will follow up with move-in details.</p>`;
  return sendEmail({ to: app.contact_email, subject: `Exhibitor payment confirmed — ${app.reference}`, html });
}

// Balance-due request with a pay link (sent manually by admin or automatically
// ~30 days before set-up).
export async function sendExhibitorBalanceRequest(app, { url }) {
  if (!app?.contact_email) return { skipped: true, reason: 'no_recipient' };
  const html =
    `<h1>Your exhibitor balance is due</h1>` +
    `<p>Reference <strong>${app.reference}</strong></p>` +
    `<p>Balance due: <strong>${money(app.balance_cents)}</strong></p>` +
    `<p><a href="${url}" style="display:inline-block;padding:10px 18px;background:#7c3aed;color:#fff;border-radius:8px;text-decoration:none">Pay balance</a></p>` +
    `<p>Or pay by check payable to ${CHECK_PAYEE}, mailed to ${CHECK_ADDRESS}.</p>`;
  return sendEmail({ to: app.contact_email, subject: `Balance due — ${app.reference}`, html });
}

// Application received — confirmation to the applicant on submit.
export async function sendExhibitorApplicationReceived(app) {
  if (!app?.contact_email) return { skipped: true, reason: 'no_recipient' };
  const html =
    `<h1>We received your exhibitor application ✅</h1>` +
    `<p>Thanks, ${app.vendor_name}! Your application was submitted successfully.</p>` +
    `<p>Reference <strong>${app.reference}</strong></p>` +
    exhibitorBreakdownHtml(app) +
    `<p>Order total: <strong>${money(app.total_cents)}</strong> (nothing charged yet).</p>` +
    `<p>Our team will review it and email you with approval and payment details. Your selected table(s) are held while we review.</p>`;
  return sendEmail({ to: app.contact_email, subject: `Application received — ${app.reference}`, html });
}

// Approval notice — tells the vendor they're approved (payment requested next).
export async function sendExhibitorApprovalNotice(app) {
  if (!app?.contact_email) return { skipped: true, reason: 'no_recipient' };
  const html =
    `<h1>Your exhibitor application is approved 🎉</h1>` +
    `<p>Reference <strong>${app.reference}</strong></p>` +
    `<p>Great news — your application for <strong>${app.vendor_name}</strong> has been approved.</p>` +
    exhibitorBreakdownHtml(app) +
    `<p>Order total: <strong>${money(app.total_cents)}</strong>.</p>` +
    `<p>We'll follow up shortly with a payment request to secure your space.</p>`;
  return sendEmail({ to: app.contact_email, subject: `Approved — ${app.reference}`, html });
}

// Payment request with two pay links: deposit or pay-in-full.
export async function sendExhibitorPaymentRequest(app, { depositUrl, fullUrl }) {
  if (!app?.contact_email) return { skipped: true, reason: 'no_recipient' };
  const btn = (url, label) =>
    `<a href="${url}" style="display:inline-block;margin:4px 8px 4px 0;padding:10px 18px;background:#7c3aed;color:#fff;border-radius:8px;text-decoration:none">${label}</a>`;
  const html =
    `<h1>You're approved — complete your exhibitor payment 🎉</h1>` +
    `<p>Great news, ${app.vendor_name}! Your application is approved. Reference <strong>${app.reference}</strong></p>` +
    exhibitorBreakdownHtml(app) +
    `<p>Order total: <strong>${money(app.total_cents)}</strong>. Choose how to pay to secure your space:</p>` +
    `<p>${btn(depositUrl, `Pay deposit — ${money(app.deposit_cents)}`)}${btn(fullUrl, `Pay in full — ${money(app.total_cents)}`)}</p>` +
    `<p class="muted">Paying the deposit reserves your space; the remaining balance is requested before the show. ` +
    `Or pay by check payable to ${CHECK_PAYEE}, mailed to ${CHECK_ADDRESS}.</p>`;
  return sendEmail({ to: app.contact_email, subject: `You're approved — complete your payment (${app.reference})`, html });
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
