import { Router } from 'express';
import { z } from 'zod';
import { query } from '../db/pool.js';
import { asyncHandler, notFound } from '../lib/http.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { renderBlocks } from '../lib/renderBlocks.js';
import { audit } from '../lib/audit.js';

// Block-based Page Builder (§13.1): blocks JSONB is the source of truth; on
// publish the server renders + caches body_html and snapshots a version.
export const adminPagesRouter = Router();
adminPagesRouter.use(requireAuth, requireRole('admin', 'editor'));

const blocksSchema = z.array(z.object({ type: z.string(), data: z.record(z.any()).optional() })).max(200);

adminPagesRouter.get('/', asyncHandler(async (_q, res) => {
  const { rows } = await query(`SELECT id, slug, title, is_published, published_at, updated_at FROM pages ORDER BY title`);
  res.json({ pages: rows });
}));

adminPagesRouter.get('/:id', asyncHandler(async (req, res) => {
  const { rows } = await query(`SELECT * FROM pages WHERE id=$1`, [req.params.id]);
  if (!rows[0]) throw notFound('Page not found');
  res.json({ page: rows[0] });
}));

const createSchema = z.object({
  slug: z.string().min(1).max(80).regex(/^[a-z0-9-]+$/),
  title: z.string().min(1).max(200),
  blocks: blocksSchema.optional(),
  seo_title: z.string().max(200).optional().nullable(),
  seo_description: z.string().max(400).optional().nullable(),
  og_image_url: z.string().url().optional().nullable(),
});

adminPagesRouter.post('/', asyncHandler(async (req, res) => {
  const p = createSchema.parse(req.body);
  const { rows } = await query(
    `INSERT INTO pages (slug, title, blocks, seo_title, seo_description, og_image_url)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [p.slug, p.title, JSON.stringify(p.blocks ?? []), p.seo_title ?? null, p.seo_description ?? null, p.og_image_url ?? null],
  ).catch((e) => { if (e.code === '23505') throw notFound('Slug already in use'); throw e; });
  await audit(req.user.id, 'page.create', { entity: 'page', entityId: rows[0].id });
  res.status(201).json({ page: rows[0] });
}));

const saveSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  blocks: blocksSchema,
  seo_title: z.string().max(200).optional().nullable(),
  seo_description: z.string().max(400).optional().nullable(),
  og_image_url: z.string().url().optional().nullable(),
});

// PUT /:id — autosave/draft (does not publish).
adminPagesRouter.put('/:id', asyncHandler(async (req, res) => {
  const p = saveSchema.parse(req.body);
  const { rows } = await query(
    `UPDATE pages SET title=COALESCE($2,title), blocks=$3, seo_title=$4, seo_description=$5, og_image_url=$6
      WHERE id=$1 RETURNING *`,
    [req.params.id, p.title ?? null, JSON.stringify(p.blocks), p.seo_title ?? null, p.seo_description ?? null, p.og_image_url ?? null],
  );
  if (!rows[0]) throw notFound('Page not found');
  res.json({ page: rows[0] });
}));

// POST /:id/publish — render+sanitize body_html, snapshot a version, publish.
adminPagesRouter.post('/:id/publish', asyncHandler(async (req, res) => {
  const cur = (await query(`SELECT * FROM pages WHERE id=$1`, [req.params.id])).rows[0];
  if (!cur) throw notFound('Page not found');
  const bodyHtml = renderBlocks(cur.blocks);
  await query(`INSERT INTO page_versions (page_id, blocks, created_by) VALUES ($1,$2,$3)`, [cur.id, JSON.stringify(cur.blocks), req.user.id]);
  const { rows } = await query(
    `UPDATE pages SET body_html=$2, is_published=TRUE, published_at=now() WHERE id=$1 RETURNING *`,
    [cur.id, bodyHtml],
  );
  await audit(req.user.id, 'page.publish', { entity: 'page', entityId: cur.id });
  res.json({ page: rows[0] });
}));

// POST /:id/unpublish
adminPagesRouter.post('/:id/unpublish', asyncHandler(async (req, res) => {
  const { rows } = await query(`UPDATE pages SET is_published=FALSE WHERE id=$1 RETURNING id, is_published`, [req.params.id]);
  if (!rows[0]) throw notFound('Page not found');
  res.json({ page: rows[0] });
}));

// GET /:id/versions  +  POST /:id/restore/:versionId
adminPagesRouter.get('/:id/versions', asyncHandler(async (req, res) => {
  const { rows } = await query(
    `SELECT v.id, v.created_at, u.email AS by FROM page_versions v LEFT JOIN users u ON u.id=v.created_by
      WHERE v.page_id=$1 ORDER BY v.created_at DESC`,
    [req.params.id],
  );
  res.json({ versions: rows });
}));

adminPagesRouter.post('/:id/restore/:versionId', asyncHandler(async (req, res) => {
  const v = (await query(`SELECT blocks FROM page_versions WHERE id=$1 AND page_id=$2`, [req.params.versionId, req.params.id])).rows[0];
  if (!v) throw notFound('Version not found');
  const { rows } = await query(`UPDATE pages SET blocks=$2 WHERE id=$1 RETURNING *`, [req.params.id, JSON.stringify(v.blocks)]);
  await audit(req.user.id, 'page.restore', { entity: 'page', entityId: req.params.id, meta: { version: req.params.versionId } });
  res.json({ page: rows[0] });
}));

adminPagesRouter.delete('/:id', asyncHandler(async (req, res) => {
  const { rowCount } = await query(`DELETE FROM pages WHERE id=$1`, [req.params.id]);
  if (!rowCount) throw notFound('Page not found');
  await audit(req.user.id, 'page.delete', { entity: 'page', entityId: req.params.id });
  res.json({ ok: true });
}));
