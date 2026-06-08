import { Router } from 'express';
import { z } from 'zod';
import { query } from '../db/pool.js';
import { asyncHandler, notFound } from '../lib/http.js';
import { formLimiter } from '../middleware/rateLimit.js';
import { sanitizeHtml } from '../lib/sanitize.js';

// Public read endpoints + public form submissions (§7, §14).
export const publicRouter = Router();

// GET /slides — active hero slides, ordered.
publicRouter.get(
  '/slides',
  asyncHandler(async (_req, res) => {
    const { rows } = await query(
      `SELECT id, title, subtitle, image_url, cta_label, cta_url, sort_order
         FROM slides WHERE is_active = TRUE ORDER BY sort_order, created_at`,
    );
    res.json({ slides: rows });
  }),
);

// GET /show-info
publicRouter.get(
  '/show-info',
  asyncHandler(async (_req, res) => {
    const { rows } = await query(`SELECT * FROM show_info WHERE id = 1`);
    res.json({ showInfo: rows[0] || null });
  }),
);

// GET /guests?featured=true&category=celebrities
publicRouter.get(
  '/guests',
  asyncHandler(async (req, res) => {
    const featured = req.query.featured === 'true';
    const category = typeof req.query.category === 'string' ? req.query.category : null;
    const params = [];
    const where = ['is_active = TRUE'];
    if (featured) where.push('is_featured = TRUE');
    if (category) {
      params.push(category);
      where.push(`category = $${params.length}`);
    }
    // Homepage shows exactly 8 featured (§7.1).
    const limit = featured ? 8 : 500;
    const { rows } = await query(
      `SELECT id, name, known_for, bio, headshot_url, category, is_featured, sort_order
         FROM guests WHERE ${where.join(' AND ')}
        ORDER BY sort_order, name LIMIT ${limit}`,
      params,
    );
    res.json({ guests: rows });
  }),
);

// GET /ticket-types
publicRouter.get(
  '/ticket-types',
  asyncHandler(async (_req, res) => {
    const { rows } = await query(
      `SELECT id, code, name, description, price_cents, currency, is_digital,
              quantity_total, quantity_sold, sort_order
         FROM ticket_types WHERE is_active = TRUE ORDER BY sort_order`,
    );
    res.json({ ticketTypes: rows });
  }),
);

// GET /products — store listing (active products) (§10).
publicRouter.get(
  '/products',
  asyncHandler(async (_req, res) => {
    const { rows } = await query(
      `SELECT id, slug, title, description, images, price_cents, currency
         FROM products WHERE is_active = TRUE ORDER BY sort_order, title`,
    );
    res.json({ products: rows });
  }),
);

// GET /products/:slug — product detail with active variants.
publicRouter.get(
  '/products/:slug',
  asyncHandler(async (req, res) => {
    const { rows } = await query(
      `SELECT id, slug, title, description, images, price_cents, currency
         FROM products WHERE slug = $1 AND is_active = TRUE`,
      [req.params.slug],
    );
    const product = rows[0];
    if (!product) throw notFound('Product not found');
    const variants = (
      await query(
        `SELECT id, sku, options, price_cents, inventory FROM product_variants
          WHERE product_id = $1 AND is_active = TRUE ORDER BY created_at`,
        [product.id],
      )
    ).rows;
    res.json({ product: { ...product, variants } });
  }),
);

// GET /booths — vendor floor: booths + the floor-plan image URL (§9).
publicRouter.get(
  '/booths',
  asyncHandler(async (_req, res) => {
    const { getSettingValue } = await import('../lib/settings.js');
    const floorplanUrl = await getSettingValue('vendor.floorplan_url');
    const { rows } = await query(
      `SELECT id, label, zone, price_cents, status, pos_x, pos_y, width, height
         FROM booths ORDER BY label`,
    );
    res.set('Cache-Control', 'no-store');
    res.json({ floorplanUrl: floorplanUrl || null, booths: rows });
  }),
);

// GET /faqs
publicRouter.get(
  '/faqs',
  asyncHandler(async (_req, res) => {
    const { rows } = await query(
      `SELECT id, question, answer, sort_order FROM faqs
        WHERE is_active = TRUE ORDER BY sort_order`,
    );
    res.json({ faqs: rows });
  }),
);

// GET /nav — assembled two-level mega-menu.
publicRouter.get(
  '/nav',
  asyncHandler(async (_req, res) => {
    const { rows } = await query(
      `SELECT id, parent_id, label, route, url, sort_order, is_cta, opens_new_tab
         FROM nav_menu WHERE is_active = TRUE ORDER BY sort_order`,
    );
    const top = rows.filter((r) => !r.parent_id).map((r) => ({ ...r, children: [] }));
    const byId = Object.fromEntries(top.map((t) => [t.id, t]));
    for (const r of rows.filter((x) => x.parent_id)) {
      byId[r.parent_id]?.children.push(r);
    }
    res.json({ nav: top });
  }),
);

// GET /pages/:slug — published CMS page (serves sanitized cache).
publicRouter.get(
  '/pages/:slug',
  asyncHandler(async (req, res) => {
    const { rows } = await query(
      `SELECT slug, title, blocks, body_html, seo_title, seo_description, og_image_url
         FROM pages WHERE slug = $1 AND is_published = TRUE`,
      [req.params.slug],
    );
    if (!rows[0]) throw notFound('Page not found');
    res.json({ page: rows[0] });
  }),
);

// POST /newsletter — records the subscriber as `pending`. The double opt-in
// confirmation email is sent once SendGrid is wired (§12, Phase 8).
const emailSchema = z.object({ email: z.string().email() });
publicRouter.post(
  '/newsletter',
  formLimiter,
  asyncHandler(async (req, res) => {
    const { email } = emailSchema.parse(req.body);
    await query(
      `INSERT INTO newsletter_subscribers (email, status)
       VALUES ($1, 'pending')
       ON CONFLICT (email) DO NOTHING`,
      [email],
    );
    res.json({ ok: true });
  }),
);

// POST /contact, /media-inquiry, /exhibitor-application -> contact_messages.
const contactSchema = z.object({
  name: z.string().min(1).max(200),
  email: z.string().email(),
  company: z.string().max(200).optional(),
  subject: z.string().max(300).optional(),
  message: z.string().min(1).max(8000),
});

function contactHandler(kind) {
  return asyncHandler(async (req, res) => {
    const data = contactSchema.parse(req.body);
    await query(
      `INSERT INTO contact_messages (kind, name, email, company, subject, message)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        kind,
        data.name,
        data.email,
        data.company ?? null,
        data.subject ?? null,
        sanitizeHtml(data.message),
      ],
    );
    res.json({ ok: true });
  });
}

publicRouter.post('/contact', formLimiter, contactHandler('contact'));
publicRouter.post('/media-inquiry', formLimiter, contactHandler('media'));
publicRouter.post('/exhibitor-application', formLimiter, contactHandler('exhibitor'));
