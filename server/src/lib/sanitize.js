import { JSDOM } from 'jsdom';
import createDOMPurify from 'dompurify';

// Server-side HTML sanitizer for admin-authored content (CMS blocks, email
// bodies) — XSS defense (§4.3). Allowlist-based.
const window = new JSDOM('').window;
const DOMPurify = createDOMPurify(window);

const CONFIG = {
  ALLOWED_TAGS: [
    'a', 'b', 'i', 'em', 'strong', 'u', 'p', 'br', 'ul', 'ol', 'li',
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'pre', 'code',
    'span', 'div', 'img', 'figure', 'figcaption', 'hr', 'table', 'thead',
    'tbody', 'tr', 'th', 'td',
  ],
  ALLOWED_ATTR: ['href', 'title', 'target', 'rel', 'src', 'alt', 'width', 'height', 'class'],
  ALLOWED_URI_REGEXP: /^(?:https?:|mailto:|tel:|\/)/i,
  ADD_ATTR: ['target'],
};

/** Sanitize an HTML fragment. Returns safe HTML. */
export function sanitizeHtml(dirty) {
  if (dirty == null) return '';
  const clean = DOMPurify.sanitize(String(dirty), CONFIG);
  return clean;
}
