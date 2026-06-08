import { Router } from 'express';
import { z } from 'zod';
import { query } from '../db/pool.js';
import { asyncHandler, notFound } from '../lib/http.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { audit } from '../lib/audit.js';

// Admin booth management (§9): define booths as normalized rectangles over the
// uploaded floor-plan image, set pricing/zone, block/release.
export const adminBoothsRouter = Router();

adminBoothsRouter.use(requireAuth, requireRole('admin', 'editor'));

const unit = z.number().min(0).max(1);
const boothSchema = z.object({
  label: z.string().min(1).max(40),
  zone: z.string().max(60).optional().nullable(),
  price_cents: z.number().int().min(0),
  pos_x: unit,
  pos_y: unit,
  width: unit,
  height: unit,
});

adminBoothsRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    const { rows } = await query(`SELECT * FROM booths ORDER BY label`);
    res.json({ booths: rows });
  }),
);

adminBoothsRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const b = boothSchema.parse(req.body);
    const { rows } = await query(
      `INSERT INTO booths (label, zone, price_cents, pos_x, pos_y, width, height)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [b.label, b.zone ?? null, b.price_cents, b.pos_x, b.pos_y, b.width, b.height],
    );
    await audit(req.user.id, 'booth.create', { entity: 'booth', entityId: rows[0].id });
    res.status(201).json({ booth: rows[0] });
  }),
);

adminBoothsRouter.put(
  '/:id',
  asyncHandler(async (req, res) => {
    const b = boothSchema.parse(req.body);
    const { rows } = await query(
      `UPDATE booths SET label=$2, zone=$3, price_cents=$4, pos_x=$5, pos_y=$6,
              width=$7, height=$8 WHERE id=$1 RETURNING *`,
      [req.params.id, b.label, b.zone ?? null, b.price_cents, b.pos_x, b.pos_y, b.width, b.height],
    );
    if (!rows[0]) throw notFound('Booth not found');
    await audit(req.user.id, 'booth.update', { entity: 'booth', entityId: req.params.id });
    res.json({ booth: rows[0] });
  }),
);

// Block/release a booth (admin housekeeping). Won't touch sold booths.
adminBoothsRouter.post(
  '/:id/:action(block|release)',
  asyncHandler(async (req, res) => {
    const status = req.params.action === 'block' ? 'blocked' : 'available';
    const { rows } = await query(
      `UPDATE booths SET status=$2, held_until=NULL, order_id=NULL
        WHERE id=$1 AND status <> 'sold' RETURNING *`,
      [req.params.id, status],
    );
    if (!rows[0]) throw notFound('Booth not found or already sold');
    await audit(req.user.id, `booth.${req.params.action}`, { entity: 'booth', entityId: req.params.id });
    res.json({ booth: rows[0] });
  }),
);

adminBoothsRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const { rowCount } = await query(`DELETE FROM booths WHERE id=$1 AND status<>'sold'`, [req.params.id]);
    if (rowCount === 0) throw notFound('Booth not found or already sold');
    await audit(req.user.id, 'booth.delete', { entity: 'booth', entityId: req.params.id });
    res.json({ ok: true });
  }),
);
