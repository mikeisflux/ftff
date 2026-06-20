import { Router } from 'express';
import { z } from 'zod';
import { query } from '../db/pool.js';
import { asyncHandler, notFound } from '../lib/http.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { audit } from '../lib/audit.js';

// Show-schedule CRUD. Public /schedule lists active events; this manages them.
export const adminScheduleRouter = Router();
adminScheduleRouter.use(requireAuth, requireRole('admin', 'editor'));

const eventSchema = z.object({
  title: z.string().min(1).max(300),
  day: z.enum(['Friday', 'Saturday', 'Sunday']),
  start_time: z.string().max(40).optional().nullable(),
  end_time: z.string().max(40).optional().nullable(),
  location: z.string().max(200).optional().nullable(),
  category: z.string().max(120).optional().nullable(),
  description: z.string().max(4000).optional().nullable(),
  sort_order: z.number().int().min(0).max(100000).optional(),
  is_active: z.boolean().optional(),
});

adminScheduleRouter.get('/', asyncHandler(async (_req, res) => {
  const { rows } = await query(`SELECT * FROM schedule_events ORDER BY day, sort_order, start_time, title`);
  res.json({ events: rows });
}));

adminScheduleRouter.post('/', asyncHandler(async (req, res) => {
  const e = eventSchema.parse(req.body);
  const { rows } = await query(
    `INSERT INTO schedule_events (title, day, start_time, end_time, location, category, description, sort_order, is_active)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
    [e.title, e.day, e.start_time ?? null, e.end_time ?? null, e.location ?? null, e.category ?? null,
      e.description ?? null, e.sort_order ?? 0, e.is_active ?? true],
  );
  await audit(req.user.id, 'schedule.create', { entity: 'schedule_event', entityId: rows[0].id });
  res.status(201).json({ event: rows[0] });
}));

adminScheduleRouter.put('/:id', asyncHandler(async (req, res) => {
  const e = eventSchema.parse(req.body);
  const { rows } = await query(
    `UPDATE schedule_events SET title=$2, day=$3, start_time=$4, end_time=$5, location=$6, category=$7,
            description=$8, sort_order=$9, is_active=$10 WHERE id=$1 RETURNING *`,
    [req.params.id, e.title, e.day, e.start_time ?? null, e.end_time ?? null, e.location ?? null,
      e.category ?? null, e.description ?? null, e.sort_order ?? 0, e.is_active ?? true],
  );
  if (!rows[0]) throw notFound('Event not found');
  await audit(req.user.id, 'schedule.update', { entity: 'schedule_event', entityId: req.params.id });
  res.json({ event: rows[0] });
}));

adminScheduleRouter.delete('/:id', asyncHandler(async (req, res) => {
  const { rowCount } = await query(`DELETE FROM schedule_events WHERE id=$1`, [req.params.id]);
  if (!rowCount) throw notFound('Event not found');
  await audit(req.user.id, 'schedule.delete', { entity: 'schedule_event', entityId: req.params.id });
  res.json({ ok: true });
}));
