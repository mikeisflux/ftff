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
  // Per-guest detail page extras. Pricing is in cents; null/omitted hides the
  // PRICING block + Autographs/Photo Ops tiles for that guest.
  bio_url: z.string().url().max(500).optional().nullable(),
  autograph_cents: z.number().int().min(0).max(10_000_000).optional().nullable(),
  autograph_premium_cents: z.number().int().min(0).max(10_000_000).optional().nullable(),
  photo_op_cents: z.number().int().min(0).max(10_000_000).optional().nullable(),
});

async function featuredCount(excludeId) {
  const { rows } = await query(
    `SELECT count(*)::int AS n FROM guests WHERE is_featured=TRUE AND id <> $1`,
    [excludeId ?? '00000000-0000-0000-0000-000000000000'],
  );
  return rows[0].n;
}

// Keep a guest's Autograph / Photo Op products in sync with their pricing so the
// guest detail page can sell them through the normal store cart + checkout (no
// changes to the payment path). Each type maps to one product (deterministic
// slug) + one variant (deterministic sku). When the price is unset or the guest
// is inactive, the product/variant is deactivated so it leaves listings and
// can't be added to a cart. Effectively unlimited inventory (it's a service).
async function syncGuestProducts(g) {
  const images = g.headshot_url ? JSON.stringify([g.headshot_url]) : '[]';
  const types = [
    { section: 'autographs', label: 'Autograph', cents: g.autograph_cents, slug: `autograph-${g.id}`, sku: `AUTO-${g.id}` },
    { section: 'photo_ops', label: 'Photo Op', cents: g.photo_op_cents, slug: `photo-op-${g.id}`, sku: `PHOTO-${g.id}` },
  ];
  for (const t of types) {
    if (g.is_active && t.cents != null) {
      const { rows } = await query(
        `INSERT INTO products (slug, section, title, images, price_cents, guest_id, is_active, sort_order)
         VALUES ($1,$2,$3,$4::jsonb,$5,$6,TRUE,0)
         ON CONFLICT (slug) DO UPDATE SET section=EXCLUDED.section, title=EXCLUDED.title,
           images=EXCLUDED.images, price_cents=EXCLUDED.price_cents, guest_id=EXCLUDED.guest_id, is_active=TRUE
         RETURNING id`,
        [t.slug, t.section, `${g.name} — ${t.label}`, images, t.cents, g.id],
      );
      await query(
        `INSERT INTO product_variants (product_id, sku, options, price_cents, inventory, is_active)
         VALUES ($1,$2,'{}'::jsonb,NULL,1000000,TRUE)
         ON CONFLICT (sku) DO UPDATE SET product_id=EXCLUDED.product_id, inventory=1000000, is_active=TRUE`,
        [rows[0].id, t.sku],
      );
    } else {
      await query(`UPDATE products SET is_active=FALSE WHERE slug=$1`, [t.slug]);
      await query(`UPDATE product_variants SET is_active=FALSE WHERE sku=$1`, [t.sku]);
    }
  }
}

adminGuestsRouter.get('/', asyncHandler(async (_q, res) => res.json({ guests: (await query(`SELECT * FROM guests ORDER BY sort_order, name`)).rows })));

adminGuestsRouter.post('/', asyncHandler(async (req, res) => {
  const g = guestSchema.parse(req.body);
  if (g.is_featured && (await featuredCount()) >= MAX_FEATURED) {
    throw badRequest(`Only ${MAX_FEATURED} guests can be featured on the homepage`);
  }
  const { rows } = await query(
    `INSERT INTO guests (name, known_for, bio, bio_url, headshot_url, category, tier, socials, appearance_days,
                         is_featured, is_active, autograph_cents, autograph_premium_cents, photo_op_cents, sort_order)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,(SELECT COALESCE(MAX(sort_order)+1,0) FROM guests)) RETURNING *`,
    [g.name, g.known_for ?? null, g.bio ? sanitizeHtml(g.bio) : null, g.bio_url ?? null, g.headshot_url ?? null, g.category, g.tier ?? 'featured',
      JSON.stringify(g.socials ?? {}), JSON.stringify(g.appearance_days ?? []), g.is_featured ?? false, g.is_active ?? true,
      g.autograph_cents ?? null, g.autograph_premium_cents ?? null, g.photo_op_cents ?? null],
  );
  await audit(req.user.id, 'guest.create', { entity: 'guest', entityId: rows[0].id });
  await syncGuestProducts(rows[0]);
  res.status(201).json({ guest: rows[0] });
}));

adminGuestsRouter.put('/:id', asyncHandler(async (req, res) => {
  const g = guestSchema.parse(req.body);
  if (g.is_featured && (await featuredCount(req.params.id)) >= MAX_FEATURED) {
    throw badRequest(`Only ${MAX_FEATURED} guests can be featured on the homepage`);
  }
  const { rows } = await query(
    `UPDATE guests SET name=$2, known_for=$3, bio=$4, bio_url=$5, headshot_url=$6, category=$7, tier=$8, socials=$9,
            appearance_days=$10, is_featured=$11, is_active=$12,
            autograph_cents=$13, autograph_premium_cents=$14, photo_op_cents=$15 WHERE id=$1 RETURNING *`,
    [req.params.id, g.name, g.known_for ?? null, g.bio ? sanitizeHtml(g.bio) : null, g.bio_url ?? null, g.headshot_url ?? null,
      g.category, g.tier ?? 'featured', JSON.stringify(g.socials ?? {}), JSON.stringify(g.appearance_days ?? []), g.is_featured ?? false, g.is_active ?? true,
      g.autograph_cents ?? null, g.autograph_premium_cents ?? null, g.photo_op_cents ?? null],
  );
  if (!rows[0]) throw notFound('Guest not found');
  await syncGuestProducts(rows[0]);
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
