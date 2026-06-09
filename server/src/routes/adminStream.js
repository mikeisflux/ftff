import { Router } from 'express';
import { query } from '../db/pool.js';
import { asyncHandler, HttpError } from '../lib/http.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { setSetting } from '../lib/settings.js';
import { audit } from '../lib/audit.js';
import { getCloudflareConfig, getLiveInput, createLiveInput, listVideos } from '../lib/cloudflare.js';

// Admin livestream control (§11): create/inspect the live input (RTMPS ingest
// for the production team), see state, manage the VOD library.
export const adminStreamRouter = Router();
adminStreamRouter.use(requireAuth, requireRole('admin', 'editor'));

function requireConfig(cfg) {
  if (!cfg) throw new HttpError(503, 'Cloudflare Stream is not configured in Settings.', 'cf_unconfigured');
  return cfg;
}

// GET /admin/stream — config flag + live input details (ingest URL + key).
adminStreamRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    const cfg = await getCloudflareConfig();
    if (!cfg) return res.json({ configured: false });
    let input = null;
    try { input = await getLiveInput(cfg); } catch (e) { return res.json({ configured: true, error: e.message }); }
    res.json({
      configured: true,
      liveInput: input
        ? {
            uid: input.uid,
            state: input.status?.current?.state || 'idle',
            rtmps: input.rtmps, // { url, streamKey } for the encoder
            srt: input.srt,
            webRTC: input.webRTC,
          }
        : null,
    });
  }),
);

// POST /admin/stream/live-input — create a live input and persist its id.
adminStreamRouter.post(
  '/live-input',
  asyncHandler(async (req, res) => {
    const cfg = requireConfig(await getCloudflareConfig());
    const input = await createLiveInput(cfg, { name: req.body?.name || 'Virtual Con Live' });
    await setSetting('cloudflare.live_input_id', input.uid, req.user.id);
    await audit(req.user.id, 'stream.live_input.create', { entity: 'stream', entityId: input.uid });
    res.status(201).json({ liveInput: { uid: input.uid, rtmps: input.rtmps } });
  }),
);

// GET /admin/stream/vod — VOD library.
adminStreamRouter.get(
  '/vod',
  asyncHandler(async (_req, res) => {
    const cfg = requireConfig(await getCloudflareConfig());
    const videos = await listVideos(cfg);
    res.json({ vod: videos.map((v) => ({ uid: v.uid, name: v.meta?.name, duration: v.duration, ready: v.readyToStream })) });
  }),
);
