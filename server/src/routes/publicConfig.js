import { Router } from 'express';
import { query } from '../db/pool.js';
import { asyncHandler } from '../lib/http.js';
import { getSettingValue } from '../lib/settings.js';
import { env } from '../config/env.js';

// Non-secret, browser-safe public config (§5, §7.0b): site name, social/share
// settings, and the reCAPTCHA SITE key (public by design — the secret stays
// server-side). Cached lightly.
export const publicConfigRouter = Router();

publicConfigRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    const keys = [
      'site.name', 'social.share_url', 'social.default_og_image_url', 'social.x_handle',
      'social.facebook_app_id', 'social.facebook_url', 'social.instagram_url', 'recaptcha.site_key',
      'stripe.publishable_key', 'privacy.consent_banner_enabled',
    ];
    const entries = await Promise.all(keys.map(async (k) => [k, await getSettingValue(k)]));
    const cfg = Object.fromEntries(entries);
    res.set('Cache-Control', 'public, max-age=60');
    res.json({
      siteName: cfg['site.name'] || 'For The Fans Fest',
      recaptchaSiteKey: cfg['recaptcha.site_key'] || null,
      stripePublishableKey: cfg['stripe.publishable_key'] || null,
      // Default ON for compliance; only hidden when explicitly set to 'false'.
      consentBannerEnabled: cfg['privacy.consent_banner_enabled'] !== 'false',
      social: {
        shareUrl: cfg['social.share_url'] || env.PUBLIC_URL,
        ogImage: cfg['social.default_og_image_url'] || null,
        xHandle: cfg['social.x_handle'] || null,
        facebookAppId: cfg['social.facebook_app_id'] || null,
        facebookUrl: cfg['social.facebook_url'] || null,
        instagramUrl: cfg['social.instagram_url'] || null,
      },
    });
  }),
);

// GET /sitemap.xml — published pages + key functional routes.
export async function sitemapHandler(_req, res) {
  const base = ((await getSettingValue('social.share_url')) || env.PUBLIC_URL).replace(/\/$/, '');
  const staticRoutes = ['/', '/buy-tickets', '/shop', '/all-guests', '/floor-plan', '/faqs', '/virtual'];
  const pages = (await query(`SELECT slug, updated_at FROM pages WHERE is_published=TRUE`)).rows;
  const urls = [
    ...staticRoutes.map((r) => ({ loc: `${base}${r}` })),
    ...pages.map((p) => ({ loc: `${base}/${p.slug}`, lastmod: p.updated_at?.toISOString?.() })),
  ];
  const xml =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    urls.map((u) => `  <url><loc>${u.loc}</loc>${u.lastmod ? `<lastmod>${u.lastmod}</lastmod>` : ''}</url>`).join('\n') +
    `\n</urlset>\n`;
  res.set('Content-Type', 'application/xml').send(xml);
}

export function robotsHandler(_req, res) {
  res.type('text/plain').send(`User-agent: *\nAllow: /\nDisallow: /admin\nSitemap: ${env.PUBLIC_URL}/sitemap.xml\n`);
}
