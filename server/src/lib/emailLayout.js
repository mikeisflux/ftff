import { JSDOM } from 'jsdom';

// Email rendering for admin-authored campaigns. The block editor (TipTap) emits
// semantic HTML (h2/h3/p/ul/blockquote/img/a/…) styled by the app's stylesheet —
// which email clients never load. So before sending we (1) inline styles onto
// each element (many clients strip <style>), and (2) wrap the content in a
// responsive, table-based, light-theme shell that renders consistently across
// Gmail, Apple Mail, Outlook, and mobile.

// Per-tag inline style defaults. Any style already on the element (e.g. TipTap's
// inline image sizing) is appended last so it wins over these defaults.
const STYLE_MAP = {
  h1: 'margin:0 0 14px;font-size:26px;line-height:1.25;font-weight:800;color:#111111;',
  h2: 'margin:24px 0 10px;font-size:22px;line-height:1.3;font-weight:800;color:#111111;',
  h3: 'margin:20px 0 8px;font-size:18px;line-height:1.35;font-weight:700;color:#111111;',
  p: 'margin:0 0 14px;',
  a: 'color:#7c3aed;text-decoration:underline;',
  ul: 'margin:0 0 14px;padding-left:22px;',
  ol: 'margin:0 0 14px;padding-left:22px;',
  li: 'margin:4px 0;',
  blockquote: 'margin:0 0 14px;padding:4px 0 4px 14px;border-left:3px solid #ec4899;color:#555555;',
  hr: 'border:none;border-top:1px solid #e3e3ea;margin:22px 0;',
  img: 'max-width:100%;height:auto;border-radius:8px;display:block;margin:14px 0;',
  pre: 'background:#f1f1f4;padding:12px;border-radius:8px;overflow:auto;font-family:Menlo,Consolas,monospace;font-size:14px;',
  code: 'background:#f1f1f4;padding:2px 5px;border-radius:4px;font-family:Menlo,Consolas,monospace;font-size:0.9em;',
  strong: 'font-weight:700;',
  b: 'font-weight:700;',
  em: 'font-style:italic;',
  i: 'font-style:italic;',
};

/**
 * Apply inline styles to every supported element in an HTML fragment, using a
 * real DOM (jsdom) rather than regex so attributes/nesting are handled safely.
 * Links are also forced to open in a new tab.
 */
export function inlineEmailStyles(html) {
  const dom = new JSDOM(`<body>${html || ''}</body>`);
  const { document } = dom.window;
  for (const [tag, style] of Object.entries(STYLE_MAP)) {
    for (const el of document.body.querySelectorAll(tag)) {
      const existing = el.getAttribute('style');
      el.setAttribute('style', existing ? `${style}${existing}` : style);
      if (tag === 'a') {
        el.setAttribute('target', '_blank');
        el.setAttribute('rel', 'noopener noreferrer');
      }
    }
  }
  return document.body.innerHTML;
}

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/**
 * Wrap pre-inlined content in a full, email-client-safe HTML document with a
 * centered 600px card, optional brand header, and a light background.
 */
export function renderEmailDocument({ title, contentHtml, siteName = 'For The Fans Fest' }) {
  return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<meta http-equiv="X-UA-Compatible" content="IE=edge"/>
<meta name="color-scheme" content="light"/>
<meta name="supported-color-schemes" content="light"/>
<title>${esc(title || siteName)}</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f7;-webkit-text-size-adjust:100%;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f4f4f7;">
<tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e8e8ee;">
<tr><td style="background:#0f0f1f;padding:18px 28px;">
<span style="font-family:Arial,Helvetica,sans-serif;font-size:18px;font-weight:800;color:#ffffff;">${esc(siteName)}</span>
</td></tr>
<tr><td style="padding:28px;font-family:Arial,Helvetica,sans-serif;color:#2a2a2a;font-size:16px;line-height:1.6;">
${contentHtml}
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}
