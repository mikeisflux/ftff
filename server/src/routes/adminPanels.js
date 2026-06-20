import { Router } from 'express';
import { z } from 'zod';
import { query } from '../db/pool.js';
import { asyncHandler, notFound } from '../lib/http.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { audit } from '../lib/audit.js';

// Livestream panels CRUD. Public /panels lists active panels; this manages them.
export const adminPanelsRouter = Router();
adminPanelsRouter.use(requireAuth, requireRole('admin', 'editor'));

const panelSchema = z.object({
  title: z.string().min(1).max(300),
  day: z.enum(['Friday', 'Saturday', 'Sunday']),
  start_time: z.string().max(40).optional().nullable(),
  end_time: z.string().max(40).optional().nullable(),
  location: z.string().max(200).optional().nullable(),
  presenter: z.string().max(300).optional().nullable(),
  description: z.string().max(4000).optional().nullable(),
  sort_order: z.number().int().min(0).max(100000).optional(),
  is_active: z.boolean().optional(),
});

adminPanelsRouter.get('/', asyncHandler(async (_req, res) => {
  const { rows } = await query(`SELECT * FROM panels ORDER BY day, sort_order, start_time, title`);
  res.json({ panels: rows });
}));

adminPanelsRouter.post('/', asyncHandler(async (req, res) => {
  const p = panelSchema.parse(req.body);
  const { rows } = await query(
    `INSERT INTO panels (title, day, start_time, end_time, location, presenter, description, sort_order, is_active)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
    [p.title, p.day, p.start_time ?? null, p.end_time ?? null, p.location ?? null, p.presenter ?? null,
      p.description ?? null, p.sort_order ?? 0, p.is_active ?? true],
  );
  await audit(req.user.id, 'panel.create', { entity: 'panel', entityId: rows[0].id });
  res.status(201).json({ panel: rows[0] });
}));

adminPanelsRouter.put('/:id', asyncHandler(async (req, res) => {
  const p = panelSchema.parse(req.body);
  const { rows } = await query(
    `UPDATE panels SET title=$2, day=$3, start_time=$4, end_time=$5, location=$6, presenter=$7,
            description=$8, sort_order=$9, is_active=$10 WHERE id=$1 RETURNING *`,
    [req.params.id, p.title, p.day, p.start_time ?? null, p.end_time ?? null, p.location ?? null,
      p.presenter ?? null, p.description ?? null, p.sort_order ?? 0, p.is_active ?? true],
  );
  if (!rows[0]) throw notFound('Panel not found');
  await audit(req.user.id, 'panel.update', { entity: 'panel', entityId: req.params.id });
  res.json({ panel: rows[0] });
}));

adminPanelsRouter.delete('/:id', asyncHandler(async (req, res) => {
  const { rowCount } = await query(`DELETE FROM panels WHERE id=$1`, [req.params.id]);
  if (!rowCount) throw notFound('Panel not found');
  await audit(req.user.id, 'panel.delete', { entity: 'panel', entityId: req.params.id });
  res.json({ ok: true });
}));
