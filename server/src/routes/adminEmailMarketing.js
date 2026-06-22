import { Router } from 'express';
import { z } from 'zod';
import { query } from '../db/pool.js';
import { env } from '../config/env.js';
import { asyncHandler, notFound, badRequest } from '../lib/http.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { audit } from '../lib/audit.js';
import { sendEmail } from '../lib/email.js';
import { inlineEmailStyles, renderEmailDocument } from '../lib/emailLayout.js';
import { getSettingValue } from '../lib/settings.js';
import { randomToken } from '../lib/crypto.js';

// Email marketing: manage newsletter subscribers + send campaigns to them.
export const adminEmailMarketingRouter = Router();
adminEmailMarketingRouter.use(requireAuth, requireRole('admin', 'editor'));

// GET / — subscribers + recent campaigns + counts.
adminEmailMarketingRouter.get('/', asyncHandler(async (_req, res) => {
  const subs = (await query(
    `SELECT id, email, name, source, status, created_at FROM newsletter_subscribers ORDER BY created_at DESC`,
  )).rows;
  const campaigns = (await query(
    `SELECT id, subject, audience, recipient_count, sent_count, status, sent_at, created_at
       FROM email_campaigns ORDER BY created_at DESC LIMIT 50`,
  )).rows;
  const counts = subs.reduce((m, s) => ({ ...m, [s.status]: (m[s.status] || 0) + 1 }), {});
  res.json({ subscribers: subs, campaigns, counts, total: subs.length });
}));

// POST /subscribers — manually add a subscriber.
adminEmailMarketingRouter.post('/subscribers', asyncHandler(async (req, res) => {
  const { email, name } = z.object({ email: z.string().email(), name: z.string().max(200).optional().nullable() }).parse(req.body);
  const { rows } = await query(
    `INSERT INTO newsletter_subscribers (email, status, name, source, confirm_token)
     VALUES ($1,'subscribed',$2,'admin',$3)
     ON CONFLICT (email) DO UPDATE SET status='subscribed', name=COALESCE(newsletter_subscribers.name, EXCLUDED.name)
     RETURNING id, email, name, source, status, created_at`,
    [email, name ?? null, randomToken(16)],
  );
  await audit(req.user.id, 'newsletter.add', { entity: 'subscriber', entityId: rows[0].id });
  res.status(201).json({ subscriber: rows[0] });
}));

// PUT /subscribers/:id — change status (subscribe/unsubscribe).
adminEmailMarketingRouter.put('/subscribers/:id', asyncHandler(async (req, res) => {
  const { status } = z.object({ status: z.enum(['pending', 'subscribed', 'unsubscribed']) }).parse(req.body);
  const { rows } = await query(
    `UPDATE newsletter_subscribers SET status=$2 WHERE id=$1 RETURNING id, email, name, source, status, created_at`,
    [req.params.id, status],
  );
  if (!rows[0]) throw notFound('Subscriber not found');
  res.json({ subscriber: rows[0] });
}));

adminEmailMarketingRouter.delete('/subscribers/:id', asyncHandler(async (req, res) => {
  const { rowCount } = await query(`DELETE FROM newsletter_subscribers WHERE id=$1`, [req.params.id]);
  if (!rowCount) throw notFound('Subscriber not found');
  await audit(req.user.id, 'newsletter.delete', { entity: 'subscriber', entityId: req.params.id });
  res.json({ ok: true });
}));

adminEmailMarketingRouter.get('/export.csv', asyncHandler(async (_req, res) => {
  const { rows } = await query(`SELECT email, name, source, status, created_at FROM newsletter_subscribers ORDER BY created_at DESC`);
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const csv = ['email,name,source,status,created_at']
    .concat(rows.map((r) => [r.email, r.name, r.source, r.status, r.created_at.toISOString()].map(esc).join(',')))
    .join('\n');
  res.set('Content-Type', 'text/csv');
  res.set('Content-Disposition', 'attachment; filename="subscribers.csv"');
  res.send(csv);
}));

// POST /campaigns/test — send the in-progress campaign to the admin only, so
// they can confirm formatting in a real inbox before blasting the list.
adminEmailMarketingRouter.post('/campaigns/test', asyncHandler(async (req, res) => {
  const { subject, body_html } = z.object({
    subject: z.string().min(1).max(300),
    body_html: z.string().min(1).max(100000),
  }).parse(req.body);
  const to = req.user.email;
  if (!to) throw badRequest('Your account has no email address.');

  const siteName = (await getSettingValue('site.name')) || 'For The Fans Fest';
  const footer = `<hr style="border:none;border-top:1px solid #e3e3ea;margin:22px 0;"/>` +
    `<p style="margin:0;font-size:12px;color:#888888;">This is a <strong>test</strong> send — the live version appends a personalized unsubscribe link.</p>`;
  const html = renderEmailDocument({
    title: subject, siteName,
    contentHtml: inlineEmailStyles(body_html) + footer,
  });
  const r = await sendEmail({ to, subject: `[TEST] ${subject}`, html });
  if (r?.skipped) throw badRequest('Email isn’t configured yet (SendGrid).', 'sendgrid_unconfigured');
  await audit(req.user.id, 'campaign.test', { entity: 'campaign', meta: { to } });
  res.json({ ok: true, to });
}));

// POST /campaigns — send a campaign to subscribed (or all) recipients.
adminEmailMarketingRouter.post('/campaigns', asyncHandler(async (req, res) => {
  const { subject, body_html, audience } = z.object({
    subject: z.string().min(1).max(300),
    body_html: z.string().min(1).max(100000),
    audience: z.enum(['subscribed', 'all']).optional(),
  }).parse(req.body);
  const aud = audience || 'subscribed';

  const where = aud === 'all' ? `status <> 'unsubscribed'` : `status = 'subscribed'`;
  const recipients = (await query(
    `SELECT email, confirm_token FROM newsletter_subscribers WHERE ${where}`,
  )).rows;
  if (recipients.length === 0) throw badRequest('No recipients in that audience.', 'no_recipients');

  const { rows: c } = await query(
    `INSERT INTO email_campaigns (subject, body_html, audience, recipient_count, status, created_by)
     VALUES ($1,$2,$3,$4,'sending',$5) RETURNING *`,
    [subject, body_html, aud, recipients.length, req.user.id],
  );
  const campaign = c[0];

  // Inline the editor's HTML once (clients strip <style>), then wrap each send in
  // the email shell with a per-recipient CAN-SPAM unsubscribe footer.
  const siteName = (await getSettingValue('site.name')) || 'For The Fans Fest';
  const bodyInlined = inlineEmailStyles(body_html);
  const footer = (token) =>
    `<hr style="border:none;border-top:1px solid #e3e3ea;margin:22px 0;"/>` +
    `<p style="margin:0;font-size:12px;color:#888888;">You're receiving this because you signed up at ${siteName}. ` +
    `<a href="${env.CLIENT_ORIGIN}/api/v1/newsletter/unsubscribe?token=${token || ''}" style="color:#7c3aed;">Unsubscribe</a>.</p>`;

  let sent = 0;
  for (let i = 0; i < recipients.length; i += 20) {
    const batch = recipients.slice(i, i + 20);
    const results = await Promise.allSettled(
      batch.map((r) => sendEmail({
        to: r.email,
        subject,
        html: renderEmailDocument({ title: subject, siteName, contentHtml: bodyInlined + footer(r.confirm_token) }),
        log: false, // campaigns are recorded in the Sent campaigns tab, not per-recipient in Mail
      })),
    );
    sent += results.filter((x) => x.status === 'fulfilled' && x.value?.sent).length;
  }

  const { rows: done } = await query(
    `UPDATE email_campaigns SET sent_count=$2, status='sent', sent_at=now() WHERE id=$1 RETURNING *`,
    [campaign.id, sent],
  );
  await audit(req.user.id, 'campaign.send', { entity: 'campaign', entityId: campaign.id, meta: { recipients: recipients.length, sent } });
  res.json({ campaign: done[0], sent, recipients: recipients.length });
}));
