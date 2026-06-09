import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { query, withTransaction } from '../db/pool.js';
import { asyncHandler, notFound, badRequest } from '../lib/http.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { sanitizeHtml } from '../lib/sanitize.js';
import { storeImage } from '../lib/uploads.js';
import { audit } from '../lib/audit.js';

// Guest Tile Manager (§13.2): upload-a-photo + write-a-bio CRUD, drag-to-reorder,
// featured cap of 10 (homepage), bulk actions, headshot upload.
export const adminGuestsRouter = Router();
adminGuestsRouter.use(requireAuth, requireRole('admin', 'editor'));

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 6 * 1024 * 1024 } });
const CATEGORIES = ['celebrities', 'animation_voices', 'anime', 'gaming_stars', 'comic_creators', 'cosplayers', 'other'];
const MAX_FEATURED = 10;

const guestSchema = z.object({
  name: z.string().min(1).max(200),
  known_for: z.string().max(300).optional().nullable(),
  bio: z.string().max(8000).optional().nullable(),
  headshot_url: z.string().url().optional().nullable(),
  category: z.enum(CATEGORIES),
  tier: z.enum(['featured', 'special', 'also_appearing']).optional(),
  socials: z.record(z.string()).optional(),
  appearance_days: z.array(z.string()).optional(),
  is_featured: z.boolean().optional(),
  is_active: z.boolean().optional(),
});

async function featuredCount(excludeId) {
  const { rows } = await query(
    `SELECT count(*)::int AS n FROM guests WHERE is_featured=TRUE AND id <> $1`,
    [excludeId ?? '00000000-0000-0000-0000-000000000000'],
  );
  return rows[0].n;
}

adminGuestsRouter.get('/', asyncHandler(async (_q, res) => res.json({ guests: (await query(`SELECT * FROM guests ORDER BY sort_order, name`)).rows })));

adminGuestsRouter.post('/', asyncHandler(async (req, res) => {
  const g = guestSchema.parse(req.body);
  if (g.is_featured && (await featuredCount()) >= MAX_FEATURED) {
    throw badRequest(`Only ${MAX_FEATURED} guests can be featured on the homepage`);
  }
  const { rows } = await query(
    `INSERT INTO guests (name, known_for, bio, headshot_url, category, tier, socials, appearance_days, is_featured, is_active, sort_order)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,(SELECT COALESCE(MAX(sort_order)+1,0) FROM guests)) RETURNING *`,
    [g.name, g.known_for ?? null, g.bio ? sanitizeHtml(g.bio) : null, g.headshot_url ?? null, g.category, g.tier ?? 'featured',
      JSON.stringify(g.socials ?? {}), JSON.stringify(g.appearance_days ?? []), g.is_featured ?? false, g.is_active ?? true],
  );
  await audit(req.user.id, 'guest.create', { entity: 'guest', entityId: rows[0].id });
  res.status(201).json({ guest: rows[0] });
}));

adminGuestsRouter.put('/:id', asyncHandler(async (req, res) => {
  const g = guestSchema.parse(req.body);
  if (g.is_featured && (await featuredCount(req.params.id)) >= MAX_FEATURED) {
    throw badRequest(`Only ${MAX_FEATURED} guests can be featured on the homepage`);
  }
  const { rows } = await query(
    `UPDATE guests SET name=$2, known_for=$3, bio=$4, headshot_url=$5, category=$6, tier=$7, socials=$8,
            appearance_days=$9, is_featured=$10, is_active=$11 WHERE id=$1 RETURNING *`,
    [req.params.id, g.name, g.known_for ?? null, g.bio ? sanitizeHtml(g.bio) : null, g.headshot_url ?? null,
      g.category, g.tier ?? 'featured', JSON.stringify(g.socials ?? {}), JSON.stringify(g.appearance_days ?? []), g.is_featured ?? false, g.is_active ?? true],
  );
  if (!rows[0]) throw notFound('Guest not found');
  res.json({ guest: rows[0] });
}));

adminGuestsRouter.delete('/:id', asyncHandler(async (req, res) => {
  const { rowCount } = await query(`DELETE FROM guests WHERE id=$1`, [req.params.id]);
  if (!rowCount) throw notFound('Guest not found');
  await audit(req.user.id, 'guest.delete', { entity: 'guest', entityId: req.params.id });
  res.json({ ok: true });
}));

// Drag-to-reorder (batch, atomic) — optionally scoped to a category.
adminGuestsRouter.post('/reorder', asyncHandler(async (req, res) => {
  const { orderedIds } = z.object({ orderedIds: z.array(z.string().uuid()).max(2000) }).parse(req.body);
  await withTransaction(async (client) => {
    for (let i = 0; i < orderedIds.length; i += 1) {
      await client.query(`UPDATE guests SET sort_order=$2 WHERE id=$1`, [orderedIds[i], i]);
    }
  });
  await audit(req.user.id, 'guest.reorder', { entity: 'guest', meta: { count: orderedIds.length } });
  res.json({ ok: true });
}));

// Headshot upload -> CDN/url (§14 POST /admin/guests/:id/upload).
adminGuestsRouter.post('/:id/upload', upload.single('file'), asyncHandler(async (req, res) => {
  if (!req.file) throw badRequest('No file uploaded');
  const { url } = await storeImage(req.file.buffer);
  const { rows } = await query(`UPDATE guests SET headshot_url=$2 WHERE id=$1 RETURNING id, headshot_url`, [req.params.id, url]);
  if (!rows[0]) throw notFound('Guest not found');
  res.json({ url, guest: rows[0] });
}));
