import { Router } from 'express';
import { z } from 'zod';
import { query } from '../db/pool.js';
import { asyncHandler, notFound } from '../lib/http.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { sanitizeHtml } from '../lib/sanitize.js';
import { sendEmail } from '../lib/email.js';
import { getSettingValue } from '../lib/settings.js';
import { audit } from '../lib/audit.js';

// Gmail-style admin email client (§12): folders, list, thread read, compose/
// send (SendGrid), star/move/read, drafts, trash + permanent delete, search.
export const adminEmailRouter = Router();
adminEmailRouter.use(requireAuth, requireRole('admin', 'editor'));

const FOLDERS = ['inbox', 'sent', 'drafts', 'archive', 'spam', 'trash'];

// GET /admin/email/folders — unread counts per folder.
adminEmailRouter.get(
  '/folders',
  asyncHandler(async (_req, res) => {
    const { rows } = await query(
      `SELECT folder, count(*)::int AS total,
              count(*) FILTER (WHERE NOT is_read)::int AS unread
         FROM email_messages GROUP BY folder`,
    );
    const map = Object.fromEntries(rows.map((r) => [r.folder, r]));
    res.json({ folders: FOLDERS.map((f) => ({ folder: f, total: map[f]?.total || 0, unread: map[f]?.unread || 0 })) });
  }),
);

// GET /admin/email/messages?folder=&q=
adminEmailRouter.get(
  '/messages',
  asyncHandler(async (req, res) => {
    const folder = FOLDERS.includes(req.query.folder) ? req.query.folder : 'inbox';
    const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    const params = [folder];
    let extra = '';
    if (q) {
      params.push(`%${q}%`);
      extra = `AND (subject ILIKE $2 OR snippet ILIKE $2 OR from_email ILIKE $2 OR body_text ILIKE $2)`;
    }
    const { rows } = await query(
      `SELECT id, thread_id, folder, direction, from_email, from_name, to_emails,
              subject, snippet, is_read, is_starred, created_at
         FROM email_messages WHERE folder=$1 ${extra}
        ORDER BY created_at DESC LIMIT 200`,
      params,
    );
    res.json({ messages: rows });
  }),
);

// GET /admin/email/messages/:id — full message + thread; marks read.
adminEmailRouter.get(
  '/messages/:id',
  asyncHandler(async (req, res) => {
    const { rows } = await query(`SELECT * FROM email_messages WHERE id=$1`, [req.params.id]);
    const message = rows[0];
    if (!message) throw notFound('Message not found');
    await query(`UPDATE email_messages SET is_read=TRUE WHERE id=$1`, [message.id]);
    const thread = message.thread_id
      ? (await query(`SELECT * FROM email_messages WHERE thread_id=$1 ORDER BY created_at`, [message.thread_id])).rows
      : [message];
    res.json({ message: { ...message, is_read: true }, thread });
  }),
);

const sendSchema = z.object({
  to: z.string().email(),
  subject: z.string().max(300).default('(no subject)'),
  html: z.string().max(200_000).optional(),
  text: z.string().max(200_000).optional(),
  threadId: z.string().uuid().optional(),
});

// POST /admin/email/send — compose & send via SendGrid; save to Sent.
adminEmailRouter.post(
  '/send',
  asyncHandler(async (req, res) => {
    const body = sendSchema.parse(req.body);
    const html = body.html ? sanitizeHtml(body.html) : undefined;
    const result = await sendEmail({ to: body.to, subject: body.subject, html, text: body.text });

    const from = await getSettingValue('sendgrid.from_address');
    const fromName = await getSettingValue('sendgrid.from_name');
    const snippet = (body.text || body.html || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 160);
    const { rows } = await query(
      `INSERT INTO email_messages
         (thread_id, folder, direction, from_email, from_name, to_emails, subject,
          snippet, body_html, body_text, is_read)
       VALUES ($1,'sent','outbound',$2,$3,$4,$5,$6,$7,$8,TRUE) RETURNING *`,
      [body.threadId ?? null, from, fromName, JSON.stringify([body.to]), body.subject,
        snippet, html ?? null, body.text ?? null],
    );
    await audit(req.user.id, 'email.send', { entity: 'email', entityId: rows[0].id });
    res.status(201).json({ message: rows[0], delivery: result });
  }),
);

const draftSchema = z.object({
  id: z.string().uuid().optional(),
  to: z.string().optional(),
  subject: z.string().max(300).optional(),
  html: z.string().max(200_000).optional(),
  text: z.string().max(200_000).optional(),
});

// POST /admin/email/draft — create or update a draft.
adminEmailRouter.post(
  '/draft',
  asyncHandler(async (req, res) => {
    const d = draftSchema.parse(req.body);
    const html = d.html ? sanitizeHtml(d.html) : null;
    if (d.id) {
      const { rows } = await query(
        `UPDATE email_messages SET to_emails=$2, subject=$3, body_html=$4, body_text=$5
          WHERE id=$1 AND folder='drafts' RETURNING *`,
        [d.id, JSON.stringify(d.to ? [d.to] : []), d.subject ?? null, html, d.text ?? null],
      );
      if (!rows[0]) throw notFound('Draft not found');
      return res.json({ message: rows[0] });
    }
    const { rows } = await query(
      `INSERT INTO email_messages (folder, direction, to_emails, subject, body_html, body_text, is_read)
       VALUES ('drafts','outbound',$1,$2,$3,$4,TRUE) RETURNING *`,
      [JSON.stringify(d.to ? [d.to] : []), d.subject ?? null, html, d.text ?? null],
    );
    res.status(201).json({ message: rows[0] });
  }),
);

// POST /admin/email/messages/:id/move {folder}
adminEmailRouter.post(
  '/messages/:id/move',
  asyncHandler(async (req, res) => {
    const folder = z.enum(FOLDERS).parse(req.body.folder);
    const { rows } = await query(
      `UPDATE email_messages SET folder=$2 WHERE id=$1 RETURNING id, folder`,
      [req.params.id, folder],
    );
    if (!rows[0]) throw notFound('Message not found');
    res.json({ message: rows[0] });
  }),
);

// POST /admin/email/messages/:id/star {starred}  and  /read {read}
adminEmailRouter.post(
  '/messages/:id/:flag(star|read)',
  asyncHandler(async (req, res) => {
    const col = req.params.flag === 'star' ? 'is_starred' : 'is_read';
    const val = Boolean(req.params.flag === 'star' ? req.body.starred : req.body.read);
    const { rows } = await query(
      `UPDATE email_messages SET ${col}=$2 WHERE id=$1 RETURNING id, ${col}`,
      [req.params.id, val],
    );
    if (!rows[0]) throw notFound('Message not found');
    res.json({ message: rows[0] });
  }),
);

// DELETE /admin/email/messages/:id — to Trash; permanent if already in Trash.
adminEmailRouter.delete(
  '/messages/:id',
  asyncHandler(async (req, res) => {
    const cur = await query(`SELECT folder FROM email_messages WHERE id=$1`, [req.params.id]);
    if (!cur.rows[0]) throw notFound('Message not found');
    if (cur.rows[0].folder === 'trash') {
      await query(`DELETE FROM email_messages WHERE id=$1`, [req.params.id]);
      await audit(req.user.id, 'email.delete.permanent', { entity: 'email', entityId: req.params.id });
      return res.json({ ok: true, permanent: true });
    }
    await query(`UPDATE email_messages SET folder='trash' WHERE id=$1`, [req.params.id]);
    res.json({ ok: true, permanent: false });
  }),
);
