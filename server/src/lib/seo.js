import { query } from '../db/pool.js';
import { getSettingValue } from './settings.js';
import { env } from '../config/env.js';

// Server-rendered social/SEO meta per route (§7.0b — CRITICAL). Social crawlers
// (Facebook, X) don't execute JS, so OG/Twitter tags must be injected at the
// origin per path rather than rendered by the React SPA.

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const titleize = (slug) => slug.split('-').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

export async function getMetaForPath(pathname) {
  const siteName = (await getSettingValue('site.name')) || 'For The Fans Fest';
  const shareBase = ((await getSettingValue('social.share_url')) || env.PUBLIC_URL).replace(/\/$/, '');
  const defaultImage = await getSettingValue('social.default_og_image_url');
  const xHandle = await getSettingValue('social.x_handle');
  const fbAppId = await getSettingValue('social.facebook_app_id');

  let title = siteName;
  let description = '';
  let image = defaultImage;

  const clean = pathname.replace(/[?#].*$/, '');
  if (clean === '/' || clean === '') {
    const si = (await query(`SELECT name, tagline FROM show_info WHERE id=1`)).rows[0];
    title = si?.name || siteName;
    description = si?.tagline || '';
  } else {
    const slug = clean.replace(/^\/+/, '').split('/')[0];
    const p = (await query(
      `SELECT title, seo_title, seo_description, og_image_url FROM pages WHERE slug=$1 AND is_published=TRUE`,
      [slug],
    )).rows[0];
    if (p) {
      title = p.seo_title || `${p.title} | ${siteName}`;
      description = p.seo_description || '';
      image = p.og_image_url || image;
    } else {
      title = `${titleize(slug)} | ${siteName}`;
    }
  }

  return { title, description, image, url: `${shareBase}${clean}`, type: 'website', siteName, xHandle, fbAppId };
}

export function renderMetaTags(meta) {
  const t = [`<meta property="og:title" content="${esc(meta.title)}"/>`];
  if (meta.description) {
    t.push(`<meta name="description" content="${esc(meta.description)}"/>`);
    t.push(`<meta property="og:description" content="${esc(meta.description)}"/>`);
    t.push(`<meta name="twitter:description" content="${esc(meta.description)}"/>`);
  }
  t.push(`<meta property="og:type" content="${meta.type}"/>`);
  t.push(`<meta property="og:url" content="${esc(meta.url)}"/>`);
  t.push(`<meta property="og:site_name" content="${esc(meta.siteName)}"/>`);
  t.push(`<meta name="twitter:title" content="${esc(meta.title)}"/>`);
  t.push(`<meta name="twitter:card" content="summary_large_image"/>`);
  if (meta.image) {
    t.push(`<meta property="og:image" content="${esc(meta.image)}"/>`);
    t.push(`<meta name="twitter:image" content="${esc(meta.image)}"/>`);
  }
  if (meta.xHandle) t.push(`<meta name="twitter:site" content="${esc(meta.xHandle)}"/>`);
  if (meta.fbAppId) t.push(`<meta property="fb:app_id" content="${esc(meta.fbAppId)}"/>`);
  return t.join('\n    ');
}

/**
 * Inject per-route title + meta into the built SPA index.html. Also stamps the
 * CSP nonce onto the inline pre-paint theme script so it survives the strict CSP.
 */
export function injectMeta(indexHtml, meta, nonce) {
  const tags = renderMetaTags(meta);
  let html = indexHtml
    .replace(/<title>[\s\S]*?<\/title>/, `<title>${esc(meta.title)}</title>`)
    .replace('</head>', `    ${tags}\n  </head>`);
  if (nonce) html = html.replace('<script id="theme-init">', `<script id="theme-init" nonce="${nonce}">`);
  return html;
}
