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
import { checkoutRouter } from './routes/checkout.js';
import { ticketRouter } from './routes/tickets.js';
import { webhookRouter } from './routes/webhooks.js';
import { inboundRouter } from './routes/inbound.js';
import { adminEmailRouter } from './routes/adminEmail.js';
import { virtualRouter } from './routes/virtual.js';
import { adminStreamRouter } from './routes/adminStream.js';
import { adminUsersRouter } from './routes/adminUsers.js';
import { adminAuditRouter, adminSubmissionsRouter, adminNewsletterRouter } from './routes/adminMisc.js';
import { validateRouter } from './routes/validate.js';
import { adminTicketsRouter } from './routes/adminTickets.js';
import { adminDashboardRouter } from './routes/adminDashboard.js';
import { adminBoothsRouter } from './routes/adminBooths.js';
import { adminProductsRouter } from './routes/adminProducts.js';
import { adminOrdersRouter } from './routes/adminOrders.js';

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

  // Webhooks need non-JSON bodies (Stripe: raw for signature verification;
  // SendGrid Inbound Parse: multipart), so they mount BEFORE the JSON parser.
  app.use('/api/v1/webhooks', webhookRouter);
  app.use('/api/v1/webhooks', inboundRouter);

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
  api.use('/checkout', checkoutRouter);
  api.use('/t', ticketRouter);
  api.use('/virtual', virtualRouter);

  // Door-staff validation (cookie-auth, role-gated). CSRF double-submit.
  api.use('/validate', csrfProtection, validateRouter);

  // Admin (role-gated inside each router). CSRF double-submit applies to all
  // state-changing admin requests (§4.3) — these are the cookie-auth targets.
  api.use('/admin/settings', csrfProtection, settingsRouter);
  api.use('/admin/theme', csrfProtection, adminThemeRouter);
  api.use('/admin/tickets', csrfProtection, adminTicketsRouter);
  api.use('/admin/dashboard', csrfProtection, adminDashboardRouter);
  api.use('/admin/booths', csrfProtection, adminBoothsRouter);
  api.use('/admin/products', csrfProtection, adminProductsRouter);
  api.use('/admin/orders', csrfProtection, adminOrdersRouter);
  api.use('/admin/email', csrfProtection, adminEmailRouter);
  api.use('/admin/stream', csrfProtection, adminStreamRouter);
  api.use('/admin/users', csrfProtection, adminUsersRouter);
  api.use('/admin/audit', csrfProtection, adminAuditRouter);
  api.use('/admin/submissions', csrfProtection, adminSubmissionsRouter);
  api.use('/admin/newsletter', csrfProtection, adminNewsletterRouter);

  app.use('/api/v1', api);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
