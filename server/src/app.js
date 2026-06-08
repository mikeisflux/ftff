import express from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import { env } from './config/env.js';
import { securityHeaders, cspNonce } from './middleware/security.js';
import { globalLimiter } from './middleware/rateLimit.js';
import { csrfProtection } from './middleware/auth.js';
import { notFoundHandler, errorHandler } from './middleware/error.js';
import { authRouter } from './routes/auth.js';
import { settingsRouter } from './routes/settings.js';
import { publicThemeRouter, adminThemeRouter } from './routes/theme.js';
import { publicRouter } from './routes/public.js';

export function createApp() {
  const app = express();
  app.set('trust proxy', 1); // behind Cloudflare / reverse proxy in prod

  app.use(cspNonce);
  app.use(securityHeaders());
  app.use(
    cors({
      origin: env.CLIENT_ORIGIN,
      credentials: true, // cookies
      allowedHeaders: ['Content-Type', 'X-CSRF-Token'],
    }),
  );

  // NOTE: the Stripe webhook needs the raw body for signature verification, so
  // it is mounted in Phase 4 BEFORE this JSON parser. Until then, JSON is fine.
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());
  app.use(globalLimiter);

  app.get('/api/v1/health', (_req, res) => res.json({ ok: true, ts: Date.now() }));

  const api = express.Router();
  api.use('/auth', authRouter);

  // Public reads + guest form posts. Not CSRF-double-submit gated (anonymous
  // visitors hold no session cookie); protected by SameSite, CORS, rate limits,
  // and reCAPTCHA (wired in a later phase).
  api.use('/', publicRouter);
  api.use('/theme', publicThemeRouter);

  // Admin (role-gated inside each router). CSRF double-submit applies to all
  // state-changing admin requests (§4.3) — these are the cookie-auth targets.
  api.use('/admin/settings', csrfProtection, settingsRouter);
  api.use('/admin/theme', csrfProtection, adminThemeRouter);

  app.use('/api/v1', api);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
