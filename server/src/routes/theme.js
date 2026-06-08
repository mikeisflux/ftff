import { Router } from 'express';
import { z } from 'zod';
import { query } from '../db/pool.js';
import { asyncHandler } from '../lib/http.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { audit } from '../lib/audit.js';

// Theme tokens drive CSS custom properties sitewide (§13.3). Values are
// validated/sanitized on write to prevent CSS injection.
export const publicThemeRouter = Router();
export const adminThemeRouter = Router();

const HEX = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;
const colorToken = z.string().regex(HEX, 'Must be a hex color');
const fontName = z.string().regex(/^[\w \-]{1,48}$/, 'Invalid font name');

const paletteSchema = z.object({
  primary: colorToken,
  secondary: colorToken,
  accent: colorToken,
  background: colorToken,
  surface: colorToken,
  text: colorToken,
  muted: colorToken,
  success: colorToken,
  danger: colorToken,
});

const themeSchema = z.object({
  tokens: z.object({ dark: paletteSchema, light: paletteSchema }),
  glow_color: colorToken,
  glow_intensity: z.coerce.number().int().min(0).max(100),
  font_display: fontName,
  font_body: fontName,
  radius: z.string().regex(/^\d{1,3}px$/),
  default_mode: z.enum(['dark', 'light']),
  allow_user_toggle: z.boolean(),
  logo_url: z.string().url().nullish(),
  logo_dark_url: z.string().url().nullish(),
  logo_light_url: z.string().url().nullish(),
  favicon_url: z.string().url().nullish(),
});

async function readTheme() {
  const { rows } = await query(`SELECT * FROM theme WHERE id = 1`);
  return rows[0] || null;
}

// GET /theme (public, cached) — tokens + active logos for pre-paint inlining.
publicThemeRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    const t = await readTheme();
    res.set('Cache-Control', 'public, max-age=60');
    res.json({ theme: t });
  }),
);

adminThemeRouter.use(requireAuth, requireRole('admin', 'editor'));

adminThemeRouter.get(
  '/',
  asyncHandler(async (_req, res) => res.json({ theme: await readTheme() })),
);

// PUT /admin/theme — confirm-to-save (§13.3). Tokens validated above.
adminThemeRouter.put(
  '/',
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const t = themeSchema.parse(req.body);
    await query(
      `UPDATE theme SET tokens = $1, glow_color = $2, glow_intensity = $3,
              font_display = $4, font_body = $5, radius = $6, default_mode = $7,
              allow_user_toggle = $8, logo_url = $9, logo_dark_url = $10,
              logo_light_url = $11, favicon_url = $12, updated_at = now(),
              updated_by = $13 WHERE id = 1`,
      [
        JSON.stringify(t.tokens), t.glow_color, t.glow_intensity, t.font_display,
        t.font_body, t.radius, t.default_mode, t.allow_user_toggle, t.logo_url ?? null,
        t.logo_dark_url ?? null, t.logo_light_url ?? null, t.favicon_url ?? null, req.user.id,
      ],
    );
    await audit(req.user.id, 'theme.update', { entity: 'theme', entityId: '1' });
    res.json({ theme: await readTheme() });
  }),
);
