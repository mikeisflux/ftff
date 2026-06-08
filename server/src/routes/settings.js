import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, notFound } from '../lib/http.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { audit } from '../lib/audit.js';
import { listSettingsForAdmin, setSetting, clearSetting } from '../lib/settings.js';

// Admin Settings panel API (§5). The click-to-set → confirm-to-save UX lives in
// the client; this is the persistence layer. Secrets never come back out.
export const settingsRouter = Router();

settingsRouter.use(requireAuth, requireRole('admin'));

// GET /admin/settings — catalog with masked secrets.
settingsRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    res.json({ settings: await listSettingsForAdmin() });
  }),
);

const putSchema = z.object({ value: z.string().max(8192) });

// PUT /admin/settings/:key — confirm & save a single value.
settingsRouter.put(
  '/:key',
  asyncHandler(async (req, res) => {
    const { value } = putSchema.parse(req.body);
    const result = await setSetting(req.params.key, value, req.user.id);
    if (!result) throw notFound('Unknown setting key');
    // Audit records WHICH key changed and by whom — never the value (§5).
    await audit(req.user.id, 'settings.update', { entity: 'settings', entityId: req.params.key });
    res.json({ ok: true, key: req.params.key, isSet: true });
  }),
);

// DELETE /admin/settings/:key — clear a stored value.
settingsRouter.delete(
  '/:key',
  asyncHandler(async (req, res) => {
    const ok = await clearSetting(req.params.key, req.user.id);
    if (!ok) throw notFound('Unknown setting key');
    await audit(req.user.id, 'settings.clear', { entity: 'settings', entityId: req.params.key });
    res.json({ ok: true, key: req.params.key, isSet: false });
  }),
);
