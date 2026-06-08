import { Router } from 'express';
import { z } from 'zod';
import { query } from '../db/pool.js';
import { asyncHandler, notFound } from '../lib/http.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { sanitizeHtml } from '../lib/sanitize.js';
import { audit } from '../lib/audit.js';

// Admin store CRUD: products + variants (§10).
export const adminProductsRouter = Router();
adminProductsRouter.use(requireAuth, requireRole('admin', 'editor'));

const productSchema = z.object({
  slug: z.string().min(1).max(80).regex(/^[a-z0-9-]+$/, 'lowercase, digits, hyphens'),
  title: z.string().min(1).max(200),
  description: z.string().max(8000).optional().nullable(),
  images: z.array(z.string().url()).max(12).optional(),
  price_cents: z.number().int().min(0),
  is_active: z.boolean().optional(),
  sort_order: z.number().int().optional(),
});

const variantSchema = z.object({
  sku: z.string().max(80).optional().nullable(),
  options: z.record(z.string()).optional(),
  price_cents: z.number().int().min(0).optional().nullable(),
  inventory: z.number().int().min(0),
  is_active: z.boolean().optional(),
});

adminProductsRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    const products = (await query(`SELECT * FROM products ORDER BY sort_order, title`)).rows;
    const variants = (await query(`SELECT * FROM product_variants ORDER BY created_at`)).rows;
    const byProduct = {};
    for (const v of variants) (byProduct[v.product_id] ||= []).push(v);
    res.json({ products: products.map((p) => ({ ...p, variants: byProduct[p.id] || [] })) });
  }),
);

adminProductsRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const p = productSchema.parse(req.body);
    const { rows } = await query(
      `INSERT INTO products (slug, title, description, images, price_cents, is_active, sort_order)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [p.slug, p.title, p.description ? sanitizeHtml(p.description) : null,
        JSON.stringify(p.images || []), p.price_cents, p.is_active ?? true, p.sort_order ?? 0],
    );
    await audit(req.user.id, 'product.create', { entity: 'product', entityId: rows[0].id });
    res.status(201).json({ product: rows[0] });
  }),
);

adminProductsRouter.put(
  '/:id',
  asyncHandler(async (req, res) => {
    const p = productSchema.parse(req.body);
    const { rows } = await query(
      `UPDATE products SET slug=$2, title=$3, description=$4, images=$5, price_cents=$6,
              is_active=$7, sort_order=$8 WHERE id=$1 RETURNING *`,
      [req.params.id, p.slug, p.title, p.description ? sanitizeHtml(p.description) : null,
        JSON.stringify(p.images || []), p.price_cents, p.is_active ?? true, p.sort_order ?? 0],
    );
    if (!rows[0]) throw notFound('Product not found');
    await audit(req.user.id, 'product.update', { entity: 'product', entityId: req.params.id });
    res.json({ product: rows[0] });
  }),
);

adminProductsRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const { rowCount } = await query(`DELETE FROM products WHERE id=$1`, [req.params.id]);
    if (rowCount === 0) throw notFound('Product not found');
    await audit(req.user.id, 'product.delete', { entity: 'product', entityId: req.params.id });
    res.json({ ok: true });
  }),
);

// Variants
adminProductsRouter.post(
  '/:id/variants',
  asyncHandler(async (req, res) => {
    const v = variantSchema.parse(req.body);
    const { rows } = await query(
      `INSERT INTO product_variants (product_id, sku, options, price_cents, inventory, is_active)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [req.params.id, v.sku ?? null, JSON.stringify(v.options || {}),
        v.price_cents ?? null, v.inventory, v.is_active ?? true],
    );
    res.status(201).json({ variant: rows[0] });
  }),
);

adminProductsRouter.put(
  '/variants/:vid',
  asyncHandler(async (req, res) => {
    const v = variantSchema.parse(req.body);
    const { rows } = await query(
      `UPDATE product_variants SET sku=$2, options=$3, price_cents=$4, inventory=$5, is_active=$6
        WHERE id=$1 RETURNING *`,
      [req.params.vid, v.sku ?? null, JSON.stringify(v.options || {}),
        v.price_cents ?? null, v.inventory, v.is_active ?? true],
    );
    if (!rows[0]) throw notFound('Variant not found');
    res.json({ variant: rows[0] });
  }),
);

adminProductsRouter.delete(
  '/variants/:vid',
  asyncHandler(async (req, res) => {
    const { rowCount } = await query(`DELETE FROM product_variants WHERE id=$1`, [req.params.vid]);
    if (rowCount === 0) throw notFound('Variant not found');
    res.json({ ok: true });
  }),
);
