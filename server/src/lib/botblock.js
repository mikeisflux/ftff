import { appendFile } from 'node:fs/promises';
import crypto from 'node:crypto';
import { query } from '../db/pool.js';

// App-side integration with the BotBlock iptables firewall
// (infra/botblock-firewall). Suspicious requests are logged; once an IP crosses
// a threshold within a window it is blocked: persisted to "BlockedIP" (the sync
// cron + watcher read this) and appended to the pending file so the root watcher
// applies an iptables DROP within seconds. We also keep an in-memory cache so
// the per-request guard is O(1) even if iptables isn't available (e.g. a
// container without NET_ADMIN) — defense in depth at the app layer.

const ENABLED = process.env.BOTBLOCK_ENABLED !== 'false';
const PENDING_FILE = process.env.BOTBLOCK_PENDING_FILE || '/tmp/botblock-pending';
const THRESHOLD = Number(process.env.BOTBLOCK_THRESHOLD || 6); // strikes in window
const WINDOW_MIN = Number(process.env.BOTBLOCK_WINDOW_MINUTES || 10);
const TTL_HOURS = Number(process.env.BOTBLOCK_TTL_HOURS || 24);

const blockedCache = new Set();
const cuid = (p) => `${p}_${crypto.randomBytes(12).toString('hex')}`;

const IPV4 = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/;

// Legitimate search-engine + social-preview crawlers are never flagged or
// blocked, so SEO and link previews are never impacted. (UA-based allowlist —
// search-engine traffic comes from dedicated ranges, so this is low risk.)
const CRAWLER_UA = /(googlebot|google-inspectiontool|storebot-google|google-extended|adsbot-google|mediapartners-google|apis-google|feedfetcher-google|bingbot|bingpreview|msnbot|adidxbot|slurp|duckduckbot|duckduckgo|baiduspider|yandex(bot|images|video|media|webmaster)?|sogou|exabot|facebookexternalhit|facebookcatalog|facebot|twitterbot|linkedinbot|pinterest(bot)?|redditbot|applebot|discordbot|whatsapp|telegrambot|slackbot|slack-imgproxy|embedly|skypeuripreview|google-site-verification|ia_archiver|ahrefsbot|semrushbot|petalbot)/i;

/** Is this request from a known good search / social crawler? */
export function isAllowedCrawler(ua) {
  return Boolean(ua && CRAWLER_UA.test(ua));
}

/** Normalize Express req.ip to a bare IPv4, or null if not a public IPv4. */
export function normalizeIp(raw) {
  if (!raw) return null;
  let ip = String(raw).trim();
  if (ip.startsWith('::ffff:')) ip = ip.slice(7); // IPv4-mapped IPv6
  if (!IPV4.test(ip)) return null; // the firewall only handles IPv4
  // Never block loopback / private / link-local ranges.
  const [a, b] = ip.split('.').map(Number);
  if (a === 10 || a === 127 || (a === 192 && b === 168) || (a === 172 && b >= 16 && b <= 31) || (a === 169 && b === 254) || a === 0) {
    return null;
  }
  return ip;
}

export function isBlockedCached(ip) {
  const n = normalizeIp(ip);
  return n ? blockedCache.has(n) : false;
}

async function applyBlock(ip, reason, meta) {
  blockedCache.add(ip);
  // Persist (upsert) so the sync cron keeps the firewall reconciled.
  await query(
    `INSERT INTO "BlockedIP" ("id","ipAddress","reason","violationCount","expiresAt","updatedAt","lastUserAgent","lastPath","lastActionId")
     VALUES ($1,$2,$3,1, NOW() + ($4 || ' hours')::interval, NOW(), $5,$6,$7)
     ON CONFLICT ("ipAddress") DO UPDATE SET
       "violationCount" = "BlockedIP"."violationCount" + 1,
       "reason" = EXCLUDED."reason",
       "expiresAt" = NOW() + ($4 || ' hours')::interval,
       "updatedAt" = NOW(),
       "lastUserAgent" = EXCLUDED."lastUserAgent",
       "lastPath" = EXCLUDED."lastPath",
       "lastActionId" = EXCLUDED."lastActionId"`,
    [cuid('blk'), ip, reason, String(TTL_HOURS), meta.userAgent ?? null, meta.path ?? null, meta.actionId ?? null],
  );
  // Notify the watcher to apply the iptables DROP rule (best-effort).
  await appendFile(PENDING_FILE, `${ip}\n`).catch(() => {});
}

/**
 * Record a suspicious request. Logs to "SuspiciousActivity"; once an IP exceeds
 * THRESHOLD strikes within WINDOW_MIN minutes it is blocked. `strikes` lets a
 * single egregious event (e.g. a known exploit probe) count for more.
 */
export async function recordSuspicious(reqOrIp, reason, meta = {}, strikes = 1) {
  if (!ENABLED) return;
  const ip = normalizeIp(typeof reqOrIp === 'string' ? reqOrIp : reqOrIp?.ip);
  if (!ip) return; // ignore private/loopback/non-IPv4
  const ua = meta.userAgent ?? (typeof reqOrIp === 'object' ? reqOrIp.get?.('user-agent') : null);
  const path = meta.path ?? (typeof reqOrIp === 'object' ? reqOrIp.originalUrl : null);
  if (isAllowedCrawler(ua)) return; // never flag/block Google, Bing, social previews, etc.
  try {
    for (let i = 0; i < Math.min(strikes, 10); i += 1) {
      await query(
        `INSERT INTO "SuspiciousActivity" ("id","ipAddress","reason","actionId","path","userAgent")
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [cuid('sus'), ip, reason, meta.actionId ?? null, path, ua],
      );
    }
    if (blockedCache.has(ip)) return;
    const { rows } = await query(
      `SELECT count(*)::int AS n FROM "SuspiciousActivity"
        WHERE "ipAddress"=$1 AND "createdAt" > NOW() - ($2 || ' minutes')::interval`,
      [ip, String(WINDOW_MIN)],
    );
    if (rows[0].n >= THRESHOLD) {
      await applyBlock(ip, reason, { userAgent: ua, path, actionId: meta.actionId });
    }
  } catch (err) {
    // Never let bot-mitigation break a request.
     
    console.error('botblock recordSuspicious failed:', err.message);
  }
}

/** Refresh the in-memory cache of currently-blocked IPs from the DB. */
export async function refreshBlocked() {
  try {
    const { rows } = await query(`SELECT "ipAddress" FROM "BlockedIP" WHERE "expiresAt" > NOW()`);
    blockedCache.clear();
    for (const r of rows) blockedCache.add(r.ipAddress);
  } catch {
    /* table may not exist yet during early boot */
  }
}

let timer = null;
export function startBotblock() {
  if (!ENABLED || timer) return;
  refreshBlocked();
  timer = setInterval(refreshBlocked, 30_000);
  timer.unref?.();
}
