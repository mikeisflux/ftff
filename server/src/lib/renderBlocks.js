import { sanitizeHtml } from './sanitize.js';

// Server-side block renderer for the Page Builder (§13.1). Block JSON is the
// source of truth; this produces a sanitized HTML cache for fast public serving.
// Dynamic blocks (guest carousel, ticket cards) are rendered live on the client;
// here we emit a stable placeholder marker the public renderer can hydrate.

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function renderBlock(block) {
  const d = block?.data || {};
  switch (block?.type) {
    case 'heading': return `<h2>${esc(d.text)}</h2>`;
    case 'richtext': return `<div>${sanitizeHtml(d.html || '')}</div>`;
    case 'image': return d.url ? `<figure><img src="${esc(d.url)}" alt="${esc(d.alt)}" loading="lazy"/>${d.caption ? `<figcaption>${esc(d.caption)}</figcaption>` : ''}</figure>` : '';
    case 'button': return d.url ? `<p><a class="btn" href="${esc(d.url)}">${esc(d.label || 'Learn more')}</a></p>` : '';
    case 'divider': return '<hr/>';
    case 'spacer': return `<div style="height:${Math.min(Number(d.height) || 24, 200)}px"></div>`;
    case 'columns': return `<div class="cols">${(d.columns || []).map((c) => `<div>${sanitizeHtml(c.html || '')}</div>`).join('')}</div>`;
    case 'embed': return /^https:\/\//.test(d.url || '') ? `<div class="embed"><iframe src="${esc(d.url)}" loading="lazy" allowfullscreen></iframe></div>` : '';
    case 'html': return sanitizeHtml(d.html || '');
    // Dynamic blocks: emit a marker; the client renders live data.
    case 'guest_carousel': return '<div data-block="guest_carousel"></div>';
    case 'ticket_cards': return '<div data-block="ticket_cards"></div>';
    case 'countdown': return `<div data-block="countdown" data-to="${esc(d.to)}"></div>`;
    case 'map': return d.address ? `<div class="embed"><iframe src="https://maps.google.com/maps?q=${encodeURIComponent(d.address)}&output=embed" loading="lazy"></iframe></div>` : '';
    default: return '';
  }
}

/**
 * Render an ordered block array to an HTML cache string. User-authored HTML is
 * sanitized per-block (richtext/html/columns); structural markup and iframe
 * sources (maps/embeds, https-only) are generated here from validated, escaped
 * data, so the assembled document is safe without stripping the iframes.
 */
export function renderBlocks(blocks) {
  if (!Array.isArray(blocks)) return '';
  return blocks.map(renderBlock).join('\n');
}
