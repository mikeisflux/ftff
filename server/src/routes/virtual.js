import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { query } from '../db/pool.js';
import { env } from '../config/env.js';
import { asyncHandler, forbidden, unauthorized } from '../lib/http.js';
import { formLimiter } from '../middleware/rateLimit.js';
import { getCloudflareConfig, getLiveInput, liveHlsUrl, listVideos } from '../lib/cloudflare.js';

// Virtual Con Experience (§11): gated to holders of a Digital ticket. Entitlement
// is validated server-side on every playback-token mint; the stream URL is only
// returned with a short-lived signed token, so it can't be hotlinked by
// non-purchasers.
export const virtualRouter = Router();

const STREAM_TTL_SECONDS = 1800; // 30 min

const tokenSchema = z.object({ qr_token: z.string().min(8).max(128) });

// POST /virtual/playback-token — verify a Digital ticket, mint an access token.
virtualRouter.post(
  '/playback-token',
  formLimiter,
  asyncHandler(async (req, res) => {
    const { qr_token } = tokenSchema.parse(req.body);
    const { rows } = await query(
      `SELECT t.status, tt.is_digital
         FROM tickets t JOIN ticket_types tt ON tt.id = t.ticket_type_id
        WHERE t.qr_token = $1`,
      [qr_token],
    );
    const ticket = rows[0];
    if (!ticket || ticket.status === 'void') throw unauthorized('Ticket not valid');
    if (!ticket.is_digital) throw forbidden('A Digital ticket is required for the Virtual Con.', 'not_digital');

    // Short-lived entitlement token (our own signing). When Cloudflare signed
    // URLs are configured, this is where we'd also mint a Stream-signed token.
    const token = jwt.sign({ typ: 'stream', ent: 'digital' }, env.JWT_SECRET, { expiresIn: STREAM_TTL_SECONDS });

    const cfg = await getCloudflareConfig();
    const hls = cfg ? liveHlsUrl(cfg) : null;

    res.json({
      entitled: true,
      token,
      hls, // null until Cloudflare is configured; page shows "offline" gracefully
      expiresIn: STREAM_TTL_SECONDS,
      streamConfigured: Boolean(hls),
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
