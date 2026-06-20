import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../lib/http.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { audit } from '../lib/audit.js';
import { setSetting } from '../lib/settings.js';
import { getShippingRates, SHIPPING_KEYS, SHIPPING_REGIONS } from '../lib/shipping.js';

// Flat per-order shipping rates by destination region (Admin → Shipping).
// Editors manage the four region fees here; checkout reads them authoritatively.
export const adminShippingRouter = Router();
adminShippingRouter.use(requireAuth, requireRole('admin', 'editor'));

const ratesSchema = z.object({
  domestic: z.number().int().min(0).max(1_000_000),
  canada: z.number().int().min(0).max(1_000_000),
  uk: z.number().int().min(0).max(1_000_000),
  world: z.number().int().min(0).max(1_000_000),
});

// GET /admin/shipping — current rates (cents).
adminShippingRouter.get('/', asyncHandler(async (_req, res) => {
  res.json({ rates: await getShippingRates() });
}));

// PUT /admin/shipping — save all four rates (cents).
adminShippingRouter.put('/', asyncHandler(async (req, res) => {
  const rates = ratesSchema.parse(req.body);
  for (const region of SHIPPING_REGIONS) {
    await setSetting(SHIPPING_KEYS[region], String(rates[region]), req.user.id);
  }
  await audit(req.user.id, 'shipping.update', { entity: 'settings', entityId: 'shipping' });
  res.json({ rates: await getShippingRates() });
}));
