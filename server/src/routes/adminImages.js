import { Router } from 'express';
import { z } from 'zod';
import { query } from '../db/pool.js';
import { asyncHandler, notFound } from '../lib/http.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { audit } from '../lib/audit.js';

// Image overrides for bespoke (non-CMS) pages. The set of valid slots lives in
// the client registry (lib/pageImages.js); here we just persist slot → url so an
// admin can swap a page's picture without a code change. Reset = delete the row.
export const adminImagesRouter = Router();
adminImagesRouter.use(requireAuth, requireRole('admin', 'editor'));

const slotSchema = z.string().min(1).max(120).regex(/^[a-z0-9._-]+$/i, 'invalid slot');
const bodySchema = z.object({ url: z.string().min(1).max(1000) });

adminImagesRouter.get('/', asyncHandler(async (_req, res) => {
  const { rows } = await query(`SELECT slot, url FROM image_overrides`);
  const overrides = {};
  for (const r of rows) overrides[r.slot] = r.url;
  res.json({ overrides });
}));

adminImagesRouter.put('/:slot', asyncHandler(async (req, res) => {
  const slot = slotSchema.parse(req.params.slot);
  const { url } = bodySchema.parse(req.body);
  const { rows } = await query(
    `INSERT INTO image_overrides (slot, url) VALUES ($1,$2)
       ON CONFLICT (slot) DO UPDATE SET url = EXCLUDED.url, updated_at = now()
     RETURNING slot, url`,
    [slot, url],
  );
  await audit(req.user.id, 'image_override.set', { entity: 'image_override', entityId: slot });
  res.json({ override: rows[0] });
}));

adminImagesRouter.delete('/:slot', asyncHandler(async (req, res) => {
  const slot = slotSchema.parse(req.params.slot);
  const { rowCount } = await query(`DELETE FROM image_overrides WHERE slot=$1`, [slot]);
  if (!rowCount) throw notFound('No override set for that slot');
  await audit(req.user.id, 'image_override.reset', { entity: 'image_override', entityId: slot });
  res.json({ ok: true });
}));
