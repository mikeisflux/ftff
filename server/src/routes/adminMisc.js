import { Router } from 'express';
import { z } from 'zod';
import { query } from '../db/pool.js';
import { asyncHandler, notFound } from '../lib/http.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { audit } from '../lib/audit.js';

// Audit log viewer + submissions inbox + newsletter export (§13).
export const adminAuditRouter = Router();
export const adminSubmissionsRouter = Router();
export const adminNewsletterRouter = Router();

adminAuditRouter.use(requireAuth, requireRole('admin'));
adminSubmissionsRouter.use(requireAuth, requireRole('admin', 'editor'));
adminNewsletterRouter.use(requireAuth, requireRole('admin', 'editor'));

// GET /admin/audit?action=&limit=&offset=
adminAuditRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const limit = Math.min(Number(req.query.limit) || 100, 500);
    const offset = Math.max(Number(req.query.offset) || 0, 0);
    const params = [];
    let where = '';
    if (typeof req.query.action === 'string' && req.query.action) {
      params.push(`%${req.query.action}%`);
      where = `WHERE a.action ILIKE $${params.length}`;
    }
    params.push(limit, offset);
    const { rows } = await query(
      `SELECT a.id, a.action, a.entity, a.entity_id, a.meta, a.created_at,
              u.email AS actor_email
         FROM audit_log a LEFT JOIN users u ON u.id = a.actor_id
         ${where}
        ORDER BY a.created_at DESC
        LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    );
    res.json({ entries: rows });
  }),
);

// ── Submissions inbox (contact_messages) ─────────────────────────────────────
adminSubmissionsRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const params = [];
    let where = '';
    if (typeof req.query.kind === 'string' && req.query.kind) {
      params.push(req.query.kind);
      where = `WHERE kind = $1`;
    }
    const { rows } = await query(
      `SELECT id, kind, name, email, company, subject, message, is_read, created_at
         FROM contact_messages ${where} ORDER BY created_at DESC LIMIT 300`,
      params,
    );
    res.json({ submissions: rows });
  }),
);

adminSubmissionsRouter.post(
  '/:id/read',
  asyncHandler(async (req, res) => {
    const read = Boolean(z.object({ read: z.boolean() }).parse(req.body).read);
    const { rowCount } = await query(`UPDATE contact_messages SET is_read=$2 WHERE id=$1`, [req.params.id, read]);
    if (rowCount === 0) throw notFound('Submission not found');
    res.json({ ok: true });
  }),
);

adminSubmissionsRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const { rowCount } = await query(`DELETE FROM contact_messages WHERE id=$1`, [req.params.id]);
    if (rowCount === 0) throw notFound('Submission not found');
    await audit(req.user.id, 'submission.delete', { entity: 'contact_message', entityId: req.params.id });
    res.json({ ok: true });
  }),
);

// ── Newsletter list + CSV export ─────────────────────────────────────────────
adminNewsletterRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    const { rows } = await query(
      `SELECT email, status, created_at FROM newsletter_subscribers ORDER BY created_at DESC`,
    );
    res.json({ subscribers: rows });
  }),
);

adminNewsletterRouter.get(
  '/export.csv',
  asyncHandler(async (_req, res) => {
    const { rows } = await query(
      `SELECT email, status, created_at FROM newsletter_subscribers ORDER BY created_at DESC`,
    );
    const csv = ['email,status,created_at']
      .concat(rows.map((r) => `${r.email},${r.status},${r.created_at.toISOString()}`))
      .join('\n');
    res.set('Content-Type', 'text/csv');
    res.set('Content-Disposition', 'attachment; filename="newsletter.csv"');
    res.send(csv);
  }),
);
