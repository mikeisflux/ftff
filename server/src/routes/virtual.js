import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { query } from '../db/pool.js';
import { env } from '../config/env.js';
import { asyncHandler, unauthorized } from '../lib/http.js';
import { formLimiter } from '../middleware/rateLimit.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { getCloudflareConfig, getLiveInput, liveHlsUrl, listVideos } from '../lib/cloudflare.js';
import { getSettingValue } from '../lib/settings.js';

// Virtual Con Experience (§11): gated to holders of a Digital ticket. Entitlement
// is validated server-side on every playback-token mint; the stream URL is only
// returned with a short-lived signed token, so it can't be hotlinked by
// non-purchasers.
export const virtualRouter = Router();

const STREAM_TTL_SECONDS = 1800; // 30 min

const gateSchema = z.object({
  orderNumber: z.string().min(3).max(40),
  email: z.string().email(),
});

// POST /virtual/playback-token — Digital holders log in with their confirmation
// (order) number + email. We verify a PAID order with that number + email that
// contains a Digital ticket, then mint a short-lived access token.
virtualRouter.post(
  '/playback-token',
  formLimiter,
  asyncHandler(async (req, res) => {
    const { orderNumber, email } = gateSchema.parse(req.body);
    const { rows } = await query(
      `SELECT 1
         FROM orders o
         JOIN order_items oi ON oi.order_id = o.id AND oi.kind = 'ticket'
         JOIN ticket_types tt ON tt.id = oi.ticket_type_id AND tt.is_digital = TRUE
        WHERE upper(o.order_number) = upper($1)
          AND o.customer_email = $2
          AND o.status = 'paid'
        LIMIT 1`,
      [orderNumber.trim(), email.trim()],
    );
    if (rows.length === 0) {
      throw unauthorized('No Digital ticket found for that confirmation number and email.', 'no_match');
    }

    // Short-lived entitlement token (our own signing). When Cloudflare signed
    // URLs are configured, this is where we'd also mint a Stream-signed token.
    const token = jwt.sign({ typ: 'stream', ent: 'digital' }, env.JWT_SECRET, { expiresIn: STREAM_TTL_SECONDS });

    const cfg = await getCloudflareConfig();
    const hls = cfg ? liveHlsUrl(cfg) : null;
    const chatEnabled = (await getSettingValue('virtual.chat_enabled')) !== 'false';

    res.json({
      entitled: true,
      token,
      hls, // null until Cloudflare is configured; page shows "offline" gracefully
      expiresIn: STREAM_TTL_SECONDS,
      streamConfigured: Boolean(hls),
      chatEnabled,
    });
  }),
);

// GET /virtual/admin-preview — admins bypass the purchase gate so they can review
// the LIVE page layout without a Digital order. Mints the same short-lived stream
// token as a real holder. Server-side role check (never trusts the client).
virtualRouter.get(
  '/admin-preview',
  requireAuth,
  requireRole('admin'),
  asyncHandler(async (_req, res) => {
    const token = jwt.sign({ typ: 'stream', ent: 'admin' }, env.JWT_SECRET, { expiresIn: STREAM_TTL_SECONDS });
    const cfg = await getCloudflareConfig();
    const hls = cfg ? liveHlsUrl(cfg) : null;
    const chatEnabled = (await getSettingValue('virtual.chat_enabled')) !== 'false';
    res.json({
      entitled: true,
      preview: true,
      token,
      hls,
      expiresIn: STREAM_TTL_SECONDS,
      streamConfigured: Boolean(hls),
      chatEnabled,
    });
  }),
);

// Middleware: require a valid entitlement token (header or query) for gated reads.
function requireEntitlement(req, _res, next) {
  const raw = req.get('x-stream-token') || req.query.token;
  if (!raw) return next(unauthorized('Stream access token required'));
  try {
    const payload = jwt.verify(raw, env.JWT_SECRET);
    if (payload.typ !== 'stream') throw new Error('wrong token');
    next();
  } catch {
    next(unauthorized('Invalid or expired stream token'));
  }
}

// GET /virtual/status — public: is the stream configured / live right now.
virtualRouter.get(
  '/status',
  asyncHandler(async (_req, res) => {
    const cfg = await getCloudflareConfig();
    if (!cfg) return res.json({ configured: false, live: false });
    let live = false;
    try {
      const input = await getLiveInput(cfg);
      live = input?.status?.current?.state === 'connected';
    } catch {
      /* treat API errors as offline for the public status */
    }
    res.json({ configured: true, live });
  }),
);

// GET /virtual/vod — gated: list past recordings (Digital ticket holders only).
virtualRouter.get(
  '/vod',
  requireEntitlement,
  asyncHandler(async (_req, res) => {
    const cfg = await getCloudflareConfig();
    if (!cfg) return res.json({ vod: [] });
    const videos = await listVideos(cfg).catch(() => []);
    const vod = videos
      .filter((v) => v.readyToStream)
      .map((v) => ({
        uid: v.uid,
        name: v.meta?.name || 'Session',
        duration: v.duration,
        thumbnail: v.thumbnail,
        hls: v.playback?.hls || null,
      }));
    res.json({ vod });
  }),
);
