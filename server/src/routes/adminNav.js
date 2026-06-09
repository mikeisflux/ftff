import { Router } from 'express';
import { z } from 'zod';
import { query, withTransaction } from '../db/pool.js';
import { asyncHandler, notFound, badRequest } from '../lib/http.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { audit } from '../lib/audit.js';

// Mega-menu builder (§7.0): two-level nav CRUD + drag-to-reorder.
export const adminNavRouter = Router();
adminNavRouter.use(requireAuth, requireRole('admin', 'editor'));

const navSchema = z.object({
  parent_id: z.string().uuid().optional().nullable(),
  label: z.string().min(1).max(80),
  route: z.string().max(300).optional().nullable(),
  url: z.string().url().max(500).optional().nullable(),
  is_cta: z.boolean().optional(),
  opens_new_tab: z.boolean().optional(),
  is_active: z.boolean().optional(),
}).refine((v) => Boolean(v.route) !== Boolean(v.url), { message: 'Set exactly one of route or url' });

adminNavRouter.get('/', asyncHandler(async (_q, res) => res.json({ items: (await query(`SELECT * FROM nav_menu ORDER BY sort_order`)).rows })));

adminNavRouter.post('/', asyncHandler(async (req, res) => {
  const n = navSchema.parse(req.body);
  // Enforce max depth 2: a parent must itself be top-level.
  if (n.parent_id) {
    const p = (await query(`SELECT parent_id FROM nav_menu WHERE id=$1`, [n.parent_id])).rows[0];
    if (!p) throw notFound('Parent not found');
    if (p.parent_id) throw badRequest('Mega-menu supports max depth 2');
  }
  const { rows } = await query(
    `INSERT INTO nav_menu (parent_id, label, route, url, is_cta, opens_new_tab, is_active, sort_order)
     VALUES ($1,$2,$3,$4,$5,$6,$7,(SELECT COALESCE(MAX(sort_order)+1,0) FROM nav_menu)) RETURNING *`,
    [n.parent_id ?? null, n.label, n.route ?? null, n.url ?? null, n.is_cta ?? false, n.opens_new_tab ?? false, n.is_active ?? true],
  );
  await audit(req.user.id, 'nav.create', { entity: 'nav_menu', entityId: rows[0].id });
  res.status(201).json({ item: rows[0] });
}));

adminNavRouter.put('/:id', asyncHandler(async (req, res) => {
  const n = navSchema.parse(req.body);
  const { rows } = await query(
    `UPDATE nav_menu SET parent_id=$2, label=$3, route=$4, url=$5, is_cta=$6, opens_new_tab=$7, is_active=$8 WHERE id=$1 RETURNING *`,
    [req.params.id, n.parent_id ?? null, n.label, n.route ?? null, n.url ?? null, n.is_cta ?? false, n.opens_new_tab ?? false, n.is_active ?? true],
  );
  if (!rows[0]) throw notFound('Nav item not found');
  res.json({ item: rows[0] });
}));

adminNavRouter.delete('/:id', asyncHandler(async (req, res) => {
  const { rowCount } = await query(`DELETE FROM nav_menu WHERE id=$1`, [req.params.id]);
  if (!rowCount) throw notFound('Nav item not found');
  await audit(req.user.id, 'nav.delete', { entity: 'nav_menu', entityId: req.params.id });
  res.json({ ok: true });
}));

adminNavRouter.post('/reorder', asyncHandler(async (req, res) => {
  const { orderedIds } = z.object({ orderedIds: z.array(z.string().uuid()).max(1000) }).parse(req.body);
  await withTransaction(async (client) => {
    for (let i = 0; i < orderedIds.length; i += 1) {
      await client.query(`UPDATE nav_menu SET sort_order=$2 WHERE id=$1`, [orderedIds[i], i]);
    }
  });
  await audit(req.user.id, 'nav.reorder', { entity: 'nav_menu', meta: { count: orderedIds.length } });
  res.json({ ok: true });
}));
