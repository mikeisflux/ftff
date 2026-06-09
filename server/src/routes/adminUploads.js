import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { query } from '../db/pool.js';
import { asyncHandler, badRequest, notFound } from '../lib/http.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { storeImage } from '../lib/uploads.js';
import { audit } from '../lib/audit.js';

// Generic image upload + brand-asset library (§13.3). Uses the validated upload
// pipeline (magic bytes, size cap, randomized keys).
export const adminUploadsRouter = Router();
adminUploadsRouter.use(requireAuth, requireRole('admin', 'editor'));

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024 } });

// POST /admin/uploads — returns a public URL for use in any image field.
adminUploadsRouter.post('/', upload.single('file'), asyncHandler(async (req, res) => {
  if (!req.file) throw badRequest('No file uploaded');
  const { url, mime } = await storeImage(req.file.buffer);
  res.status(201).json({ url, mime });
}));

// POST /admin/uploads/brand-assets — upload + register a brand asset.
const kindSchema = z.enum(['logo', 'wordmark', 'favicon', 'graphic', 'document', 'other']);
adminUploadsRouter.post('/brand-assets', upload.single('file'), asyncHandler(async (req, res) => {
  if (!req.file) throw badRequest('No file uploaded');
  const kind = kindSchema.parse(req.body.kind || 'graphic');
  const { url, mime } = await storeImage(req.file.buffer);
  const { rows } = await query(
    `INSERT INTO brand_assets (kind, label, file_url, mime) VALUES ($1,$2,$3,$4) RETURNING *`,
    [kind, req.body.label || null, url, mime],
  );
  await audit(req.user.id, 'brand_asset.create', { entity: 'brand_asset', entityId: rows[0].id });
  res.status(201).json({ asset: rows[0] });
}));

adminUploadsRouter.get('/brand-assets', asyncHandler(async (_q, res) => {
  res.json({ assets: (await query(`SELECT * FROM brand_assets ORDER BY created_at DESC`)).rows });
}));

adminUploadsRouter.delete('/brand-assets/:id', asyncHandler(async (req, res) => {
  const { rowCount } = await query(`DELETE FROM brand_assets WHERE id=$1`, [req.params.id]);
  if (!rowCount) throw notFound('Asset not found');
  res.json({ ok: true });
}));
