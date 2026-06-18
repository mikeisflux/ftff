import { Router } from 'express';
import { z } from 'zod';
import { query } from '../db/pool.js';
import { asyncHandler, notFound } from '../lib/http.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { audit } from '../lib/audit.js';

// Vendor directory CRUD (§ vendors). Public /vendors lists active vendors with
// their booth number; approved exhibitor applications also create entries here.
export const adminVendorsRouter = Router();
adminVendorsRouter.use(requireAuth, requireRole('admin', 'editor'));

const vendorSchema = z.object({
  name: z.string().min(1).max(200),
  booth_number: z.string().max(40).optional().nullable(),
  category: z.string().max(120).optional().nullable(),
  website: z.string().url().max(500).optional().nullable(),
  is_active: z.boolean().optional(),
});

adminVendorsRouter.get('/', asyncHandler(async (_req, res) => {
  const { rows } = await query(`SELECT * FROM vendors ORDER BY lower(name), name`);
  res.json({ vendors: rows });
}));

adminVendorsRouter.post('/', asyncHandler(async (req, res) => {
  const v = vendorSchema.parse(req.body);
  const { rows } = await query(
    `INSERT INTO vendors (name, booth_number, category, website, is_active)
     VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [v.name, v.booth_number ?? null, v.category ?? null, v.website ?? null, v.is_active ?? true],
  );
  await audit(req.user.id, 'vendor.create', { entity: 'vendor', entityId: rows[0].id });
  res.status(201).json({ vendor: rows[0] });
}));

adminVendorsRouter.put('/:id', asyncHandler(async (req, res) => {
  const v = vendorSchema.parse(req.body);
  const { rows } = await query(
    `UPDATE vendors SET name=$2, booth_number=$3, category=$4, website=$5, is_active=$6
       WHERE id=$1 RETURNING *`,
    [req.params.id, v.name, v.booth_number ?? null, v.category ?? null, v.website ?? null, v.is_active ?? true],
  );
  if (!rows[0]) throw notFound('Vendor not found');
  await audit(req.user.id, 'vendor.update', { entity: 'vendor', entityId: req.params.id });
  res.json({ vendor: rows[0] });
}));

adminVendorsRouter.delete('/:id', asyncHandler(async (req, res) => {
  const { rowCount } = await query(`DELETE FROM vendors WHERE id=$1`, [req.params.id]);
  if (!rowCount) throw notFound('Vendor not found');
  await audit(req.user.id, 'vendor.delete', { entity: 'vendor', entityId: req.params.id });
  res.json({ ok: true });
}));
