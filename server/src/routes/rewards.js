import { Router } from 'express';
import { z } from 'zod';
import { query } from '../db/pool.js';
import { env } from '../config/env.js';
import { asyncHandler, notFound } from '../lib/http.js';
import { formLimiter } from '../middleware/rateLimit.js';
import { requireRecaptcha } from '../middleware/recaptcha.js';
import { enrollReward, REWARD_RATE } from '../lib/rewards.js';

// Public Exhibitor Rewards endpoints: enroll for a share link, and look up your
// balance + statement by email.
export const rewardsRouter = Router();

const shareLink = (code) => `${env.CLIENT_ORIGIN}/buy-tickets?ref=${encodeURIComponent(code)}`;

const enrollSchema = z.object({
  name: z.string().max(200).optional().nullable(),
  email: z.string().email(),
});

// POST /rewards/enroll -> create/fetch a reward account, return the share link.
rewardsRouter.post(
  '/enroll',
  formLimiter,
  requireRecaptcha,
  asyncHandler(async (req, res) => {
    const { name, email } = enrollSchema.parse(req.body);
    const reward = await enrollReward({ name, email });
    res.json({
      code: reward.code,
      link: shareLink(reward.code),
      name: reward.name,
      email: reward.email,
      balanceCents: reward.balance_cents,
      ratePct: Math.round(REWARD_RATE * 100),
    });
  }),
);

// POST /rewards/lookup -> balance + recent statement by email.
rewardsRouter.post(
  '/lookup',
  formLimiter,
  asyncHandler(async (req, res) => {
    const { email } = z.object({ email: z.string().email() }).parse(req.body);
    const { rows } = await query(`SELECT * FROM exhibitor_rewards WHERE email = $1`, [email]);
    const reward = rows[0];
    if (!reward) throw notFound('No rewards account found for that email.', 'not_found');
    const events = (
      await query(
        `SELECT type, sale_cents, amount_cents, note, created_at
           FROM reward_events WHERE reward_id = $1 ORDER BY created_at DESC LIMIT 50`,
        [reward.id],
      )
    ).rows;
    res.json({
      code: reward.code,
      link: shareLink(reward.code),
      name: reward.name,
      balanceCents: reward.balance_cents,
      earnedCents: reward.earned_cents,
      redeemedCents: reward.redeemed_cents,
      ratePct: Math.round(REWARD_RATE * 100),
      events,
    });
  }),
);
