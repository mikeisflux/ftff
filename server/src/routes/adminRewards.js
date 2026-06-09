import { Router } from 'express';
import { z } from 'zod';
import { query, withTransaction } from '../db/pool.js';
import { asyncHandler, notFound, badRequest, HttpError } from '../lib/http.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { audit } from '../lib/audit.js';

// Admin: Exhibitor Rewards management — balances, statements, manual adjust,
// and redeeming rewards against a booth booking.
export const adminRewardsRouter = Router();
adminRewardsRouter.use(requireAuth, requireRole('admin', 'editor'));

adminRewardsRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    const { rows } = await query(
      `SELECT r.*,
              COUNT(e.id) FILTER (WHERE e.type='earn') AS referral_count
         FROM exhibitor_rewards r
         LEFT JOIN reward_events e ON e.reward_id = r.id
        GROUP BY r.id
        ORDER BY r.balance_cents DESC, r.created_at DESC`,
    );
    res.json({ rewards: rows });
  }),
);

adminRewardsRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const r = (await query(`SELECT * FROM exhibitor_rewards WHERE id=$1`, [req.params.id])).rows[0];
    if (!r) throw notFound('Reward account not found');
    const events = (
      await query(
        `SELECT e.*, o.order_number FROM reward_events e
           LEFT JOIN orders o ON o.id = e.order_id
          WHERE e.reward_id=$1 ORDER BY e.created_at DESC`,
        [req.params.id],
      )
    ).rows;
    res.json({ reward: r, events });
  }),
);

// Manual adjustment (signed): correct a balance, grant a bonus, etc.
adminRewardsRouter.post(
  '/:id/adjust',
  asyncHandler(async (req, res) => {
    const { amountCents, note } = z.object({
      amountCents: z.coerce.number().int(),
      note: z.string().max(300).optional(),
    }).parse(req.body);
    if (amountCents === 0) throw badRequest('Amount cannot be zero.');

    const reward = await withTransaction(async (client) => {
      const r = (await client.query(`SELECT * FROM exhibitor_rewards WHERE id=$1 FOR UPDATE`, [req.params.id])).rows[0];
      if (!r) throw notFound('Reward account not found');
      if (r.balance_cents + amountCents < 0) throw new HttpError(409, 'Adjustment would make the balance negative.', 'negative');
      await client.query(
        `INSERT INTO reward_events (reward_id, type, amount_cents, note) VALUES ($1,'adjust',$2,$3)`,
        [r.id, amountCents, note ?? 'Manual adjustment'],
      );
      const upd = await client.query(
        `UPDATE exhibitor_rewards SET balance_cents = balance_cents + $2 WHERE id=$1 RETURNING *`,
        [r.id, amountCents],
      );
      return upd.rows[0];
    });
    await audit(req.user.id, 'reward.adjust', { entity: 'reward', entityId: req.params.id, meta: { amountCents } });
    res.json({ reward });
  }),
);

// Redeem rewards against a booth booking (deduct from balance).
adminRewardsRouter.post(
  '/:id/redeem',
  asyncHandler(async (req, res) => {
    const { amountCents, note } = z.object({
      amountCents: z.coerce.number().int().positive(),
      note: z.string().max(300).optional(),
    }).parse(req.body);

    const reward = await withTransaction(async (client) => {
      const r = (await client.query(`SELECT * FROM exhibitor_rewards WHERE id=$1 FOR UPDATE`, [req.params.id])).rows[0];
      if (!r) throw notFound('Reward account not found');
      if (amountCents > r.balance_cents) throw new HttpError(409, 'Cannot redeem more than the available balance.', 'insufficient');
      await client.query(
        `INSERT INTO reward_events (reward_id, type, amount_cents, note) VALUES ($1,'redeem',$2,$3)`,
        [r.id, -amountCents, note ?? 'Redeemed toward booth booking'],
      );
      const upd = await client.query(
        `UPDATE exhibitor_rewards
            SET balance_cents = balance_cents - $2, redeemed_cents = redeemed_cents + $2
          WHERE id=$1 RETURNING *`,
        [r.id, amountCents],
      );
      return upd.rows[0];
    });
    await audit(req.user.id, 'reward.redeem', { entity: 'reward', entityId: req.params.id, meta: { amountCents } });
    res.json({ reward });
  }),
);

adminRewardsRouter.post(
  '/:id/toggle',
  asyncHandler(async (req, res) => {
    const { rows } = await query(
      `UPDATE exhibitor_rewards SET is_active = NOT is_active WHERE id=$1 RETURNING *`,
      [req.params.id],
    );
    if (!rows[0]) throw notFound('Reward account not found');
    res.json({ reward: rows[0] });
  }),
);
