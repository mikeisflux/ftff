import rateLimit from 'express-rate-limit';
import { isAllowedCrawler } from '../lib/botblock.js';

// Global + sensitive-endpoint rate limits (§4.3). In production, put Cloudflare
// WAF/bot-management in front of the origin as well.

const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);

export const globalLimiter = rateLimit({
  windowMs: 60_000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  // Don't throttle legitimate search/social crawlers (auth + form limiters
  // below stay strict — crawlers never hit those anyway), nor same-host
  // loopback traffic (health checks / internal — real clients arrive via the
  // proxy with their forwarded IP).
  skip: (req) => isAllowedCrawler(req.get('user-agent')) || LOOPBACK.has(req.ip),
});

// Tighter limit for auth/login to slow brute force (lockout/backoff also
// enforced per-user in the auth route).
export const authLimiter = rateLimit({
  windowMs: 15 * 60_000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many attempts. Try again later.' },
  skip: (req) => LOOPBACK.has(req.ip),
});

// Public form submissions (contact/newsletter/etc.).
export const formLimiter = rateLimit({
  windowMs: 60_000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => LOOPBACK.has(req.ip),
});
