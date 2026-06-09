import { getSettingValue } from './settings.js';

// Cloudflare Stream integration (§11). Config-gated: all API calls require the
// account id + Stream API token entered in Settings. RTMP is ingest only —
// Cloudflare transcodes and delivers HLS for browser playback.

export async function getCloudflareConfig() {
  const accountId = await getSettingValue('cloudflare.account_id');
  const apiToken = await getSettingValue('cloudflare.stream_api_token');
  if (!accountId || !apiToken) return null;
  return {
    accountId,
    apiToken,
    liveInputId: await getSettingValue('cloudflare.live_input_id'),
    subdomain: await getSettingValue('cloudflare.customer_subdomain'),
  };
}

async function cfRequest(cfg, path, options = {}) {
  const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${cfg.accountId}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${cfg.apiToken}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.success === false) {
    const msg = data.errors?.[0]?.message || res.statusText;
    throw new Error(`Cloudflare API: ${msg}`);
  }
  return data.result;
}

// Live input status + ingest (RTMPS URL + stream key) for the production team.
export async function getLiveInput(cfg) {
  if (!cfg.liveInputId) return null;
  return cfRequest(cfg, `/stream/live_inputs/${cfg.liveInputId}`);
}

export async function createLiveInput(cfg, meta = {}) {
  return cfRequest(cfg, '/stream/live_inputs', {
    method: 'POST',
    body: JSON.stringify({ meta, recording: { mode: 'automatic' } }),
  });
}

// VOD: list recordings/videos for the account (past sessions).
export async function listVideos(cfg) {
  const result = await cfRequest(cfg, '/stream');
  return Array.isArray(result) ? result : [];
}

// Build the HLS manifest URL for the live input on the customer subdomain.
export function liveHlsUrl(cfg) {
  if (!cfg.subdomain || !cfg.liveInputId) return null;
  return `https://${cfg.subdomain}/${cfg.liveInputId}/manifest/video.m3u8`;
}
