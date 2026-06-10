import { Router } from 'express';
import { z } from 'zod';
import { query, withTransaction } from '../db/pool.js';
import { asyncHandler, notFound, conflict, badRequest } from '../lib/http.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { audit } from '../lib/audit.js';

// Content CRUD (§13): slides, faqs, show_info, ticket_types. Drag-to-reorder
// endpoints persist sort_order atomically (§14).
const guard = [requireAuth, requireRole('admin', 'editor')];

// Reusable atomic reorder over a table with a sort_order column.
async function reorder(table, orderedIds, actorId) {
  await withTransaction(async (client) => {
    for (let i = 0; i < orderedIds.length; i += 1) {
      await client.query(`UPDATE ${table} SET sort_order=$2 WHERE id=$1`, [orderedIds[i], i]);
    }
  });
  await audit(actorId, `${table}.reorder`, { entity: table, meta: { count: orderedIds.length } });
}
const reorderSchema = z.object({ orderedIds: z.array(z.string().uuid()).max(1000) });

// ── slides ───────────────────────────────────────────────────────────────────
export const adminSlidesRouter = Router();
adminSlidesRouter.use(...guard);
const slideSchema = z.object({
  title: z.string().max(200).optional().nullable(),
  subtitle: z.string().max(300).optional().nullable(),
  image_url: z.string().max(500).optional().nullable(),
  cta_label: z.string().max(80).optional().nullable(),
  cta_url: z.string().max(300).optional().nullable(),
  is_active: z.boolean().optional(),
});
adminSlidesRouter.get('/', asyncHandler(async (_q, res) => res.json({ slides: (await query(`SELECT * FROM slides ORDER BY sort_order, created_at`)).rows })));
adminSlidesRouter.post('/', asyncHandler(async (req, res) => {
  const s = slideSchema.parse(req.body);
  const { rows } = await query(
    `INSERT INTO slides (title, subtitle, image_url, cta_label, cta_url, is_active, sort_order)
     VALUES ($1,$2,$3,$4,$5,$6,(SELECT COALESCE(MAX(sort_order)+1,0) FROM slides)) RETURNING *`,
    [s.title ?? null, s.subtitle ?? null, s.image_url || null, s.cta_label ?? null, s.cta_url ?? null, s.is_active ?? true],
  );
  await audit(req.user.id, 'slide.create', { entity: 'slide', entityId: rows[0].id });
  res.status(201).json({ slide: rows[0] });
}));
adminSlidesRouter.put('/:id', asyncHandler(async (req, res) => {
  const s = slideSchema.parse(req.body);
  const { rows } = await query(
    `UPDATE slides SET title=$2, subtitle=$3, image_url=$4, cta_label=$5, cta_url=$6, is_active=$7 WHERE id=$1 RETURNING *`,
    [req.params.id, s.title ?? null, s.subtitle ?? null, s.image_url || null, s.cta_label ?? null, s.cta_url ?? null, s.is_active ?? true],
  );
  if (!rows[0]) throw notFound('Slide not found');
  res.json({ slide: rows[0] });
}));
adminSlidesRouter.delete('/:id', asyncHandler(async (req, res) => {
  const { rowCount } = await query(`DELETE FROM slides WHERE id=$1`, [req.params.id]);
  if (!rowCount) throw notFound('Slide not found');
  res.json({ ok: true });
}));
adminSlidesRouter.post('/reorder', asyncHandler(async (req, res) => {
  await reorder('slides', reorderSchema.parse(req.body).orderedIds, req.user.id);
  res.json({ ok: true });
}));

// ── faqs ─────────────────────────────────────────────────────────────────────
export const adminFaqsRouter = Router();
adminFaqsRouter.use(...guard);
const faqSchema = z.object({ question: z.string().min(1).max(500), answer: z.string().min(1).max(5000), is_active: z.boolean().optional() });
adminFaqsRouter.get('/', asyncHandler(async (_q, res) => res.json({ faqs: (await query(`SELECT * FROM faqs ORDER BY sort_order, created_at`)).rows })));
adminFaqsRouter.post('/', asyncHandler(async (req, res) => {
  const f = faqSchema.parse(req.body);
  const { rows } = await query(
    `INSERT INTO faqs (question, answer, is_active, sort_order) VALUES ($1,$2,$3,(SELECT COALESCE(MAX(sort_order)+1,0) FROM faqs)) RETURNING *`,
    [f.question, f.answer, f.is_active ?? true],
  );
  res.status(201).json({ faq: rows[0] });
}));
adminFaqsRouter.put('/:id', asyncHandler(async (req, res) => {
  const f = faqSchema.parse(req.body);
  const { rows } = await query(`UPDATE faqs SET question=$2, answer=$3, is_active=$4 WHERE id=$1 RETURNING *`, [req.params.id, f.question, f.answer, f.is_active ?? true]);
  if (!rows[0]) throw notFound('FAQ not found');
  res.json({ faq: rows[0] });
}));
adminFaqsRouter.delete('/:id', asyncHandler(async (req, res) => {
  const { rowCount } = await query(`DELETE FROM faqs WHERE id=$1`, [req.params.id]);
  if (!rowCount) throw notFound('FAQ not found');
  res.json({ ok: true });
}));
adminFaqsRouter.post('/reorder', asyncHandler(async (req, res) => {
  await reorder('faqs', reorderSchema.parse(req.body).orderedIds, req.user.id);
  res.json({ ok: true });
}));

// ── show_info (single row) ────────────────────────────────────────────────────
export const adminShowInfoRouter = Router();
adminShowInfoRouter.use(...guard);
const showSchema = z.object({
  name: z.string().max(200).optional().nullable(),
  tagline: z.string().max(300).optional().nullable(),
  starts_on: z.string().optional().nullable(),
  ends_on: z.string().optional().nullable(),
  venue: z.string().max(200).optional().nullable(),
  address: z.string().max(400).optional().nullable(),
  lat: z.number().optional().nullable(),
  lng: z.number().optional().nullable(),
  hours_json: z.array(z.object({ day: z.string(), open: z.string(), close: z.string() })).optional(),
});
adminShowInfoRouter.get('/', asyncHandler(async (_q, res) => res.json({ showInfo: (await query(`SELECT * FROM show_info WHERE id=1`)).rows[0] })));
adminShowInfoRouter.put('/', asyncHandler(async (req, res) => {
  const s = showSchema.parse(req.body);
  const { rows } = await query(
    `UPDATE show_info SET name=$1, tagline=$2, starts_on=$3, ends_on=$4, venue=$5, address=$6,
            lat=$7, lng=$8, hours_json=$9, updated_at=now() WHERE id=1 RETURNING *`,
    [s.name ?? null, s.tagline ?? null, s.starts_on || null, s.ends_on || null, s.venue ?? null,
      s.address ?? null, s.lat ?? null, s.lng ?? null, JSON.stringify(s.hours_json ?? [])],
  );
  await audit(req.user.id, 'show_info.update', { entity: 'show_info', entityId: '1' });
  res.json({ showInfo: rows[0] });
}));

// ── ticket_types (full CRUD; five seeded by default) ─────────────────────────
export const adminTicketTypesRouter = Router();
adminTicketTypesRouter.use(...guard);

const ttBase = {
  name: z.string().min(1).max(120),
  description: z.string().max(2000).optional().nullable(),
  price_cents: z.number().int().min(0),
  quantity_total: z.number().int().min(0).optional().nullable(),
  is_digital: z.boolean().optional(),
  is_active: z.boolean().optional(),
  sort_order: z.number().int().optional(),
  image_url: z.string().max(500).optional().nullable(),
};
const ttUpdate = z.object(ttBase);
const ttCreate = z.object({
  code: z.string().min(1).max(40).regex(/^[a-z0-9_]+$/, 'lowercase letters, digits, underscores'),
  ...ttBase,
});

adminTicketTypesRouter.get('/', asyncHandler(async (_q, res) =>
  res.json({ ticketTypes: (await query(`SELECT * FROM ticket_types ORDER BY sort_order`)).rows })));

adminTicketTypesRouter.post('/', asyncHandler(async (req, res) => {
  const t = ttCreate.parse(req.body);
  const { rows } = await query(
    `INSERT INTO ticket_types (code, name, description, price_cents, quantity_total, is_digital, is_active, sort_order, image_url)
     VALUES ($1,$2,$3,$4,$5,$6,$7, COALESCE($8,(SELECT COALESCE(MAX(sort_order)+1,0) FROM ticket_types)), $9)
     RETURNING *`,
    [t.code, t.name, t.description ?? null, t.price_cents, t.quantity_total ?? null,
      t.is_digital ?? false, t.is_active ?? true, t.sort_order ?? null, t.image_url ?? null],
  ).catch((e) => { if (e.code === '23505') throw badRequest('A ticket type with that code already exists'); throw e; });
  await audit(req.user.id, 'ticket_type.create', { entity: 'ticket_type', entityId: rows[0].id });
  res.status(201).json({ ticketType: rows[0] });
}));

adminTicketTypesRouter.put('/:id', asyncHandler(async (req, res) => {
  const t = ttUpdate.parse(req.body);
  const { rows } = await query(
    `UPDATE ticket_types SET name=$2, description=$3, price_cents=$4, quantity_total=$5,
            is_digital=COALESCE($6,is_digital), is_active=$7, sort_order=COALESCE($8,sort_order),
            image_url=$9
      WHERE id=$1 RETURNING *`,
    [req.params.id, t.name, t.description ?? null, t.price_cents, t.quantity_total ?? null,
      t.is_digital ?? null, t.is_active ?? true, t.sort_order ?? null, t.image_url ?? null],
  );
  if (!rows[0]) throw notFound('Ticket type not found');
  await audit(req.user.id, 'ticket_type.update', { entity: 'ticket_type', entityId: req.params.id });
  res.json({ ticketType: rows[0] });
}));

adminTicketTypesRouter.delete('/:id', asyncHandler(async (req, res) => {
  // Don't hard-delete a type that has issued tickets / order history.
  const refs = (await query(
    `SELECT (SELECT count(*) FROM tickets WHERE ticket_type_id=$1)
          + (SELECT count(*) FROM order_items WHERE ticket_type_id=$1) AS n`,
    [req.params.id],
  )).rows[0];
  if (Number(refs.n) > 0) throw conflict('This ticket type has orders — deactivate it instead of deleting.', 'in_use');
  const { rowCount } = await query(`DELETE FROM ticket_types WHERE id=$1`, [req.params.id]);
  if (rowCount === 0) throw notFound('Ticket type not found');
  await audit(req.user.id, 'ticket_type.delete', { entity: 'ticket_type', entityId: req.params.id });
  res.json({ ok: true });
}));
