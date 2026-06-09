import express from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { env, isProd } from './config/env.js';
import { securityHeaders, cspNonce, permissionsPolicy } from './middleware/security.js';
import { globalLimiter } from './middleware/rateLimit.js';
import { csrfProtection } from './middleware/auth.js';
import { botblockGuard, botblockProbeDetector } from './middleware/botblock.js';
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
import { adminSlidesRouter, adminFaqsRouter, adminShowInfoRouter, adminTicketTypesRouter } from './routes/adminContent.js';
import { adminGuestsRouter } from './routes/adminGuests.js';
import { adminNavRouter } from './routes/adminNav.js';
import { adminPagesRouter } from './routes/adminPages.js';
import { adminUploadsRouter } from './routes/adminUploads.js';
import { UPLOAD_DIR } from './lib/uploads.js';
import { publicConfigRouter, sitemapHandler, robotsHandler } from './routes/publicConfig.js';
import { getMetaForPath, injectMeta } from './lib/seo.js';
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
  app.use(permissionsPolicy);
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
  // BotBlock firewall integration: drop already-blocked IPs early and flag
  // vulnerability-scanner probes (infra/botblock-firewall).
  app.use(botblockGuard);
  app.use(botblockProbeDetector);
  app.use(globalLimiter);

  app.get('/api/v1/health', (_req, res) => res.json({ ok: true, ts: Date.now() }));

  // Serve locally-stored uploads (dev fallback for the §13 upload pipeline;
  // object storage / CDN is used in production).
  app.use('/uploads', express.static(UPLOAD_DIR, { maxAge: '1y', immutable: true }));

  const api = express.Router();
  api.use('/auth', authRouter);

  // Public reads + guest form posts. Not CSRF-double-submit gated (anonymous
  // visitors hold no session cookie); protected by SameSite, CORS, rate limits,
  // and reCAPTCHA (wired in a later phase).
  api.use('/', publicRouter);
  api.use('/theme', publicThemeRouter);
  api.use('/public-config', publicConfigRouter);
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
  api.use('/admin/slides', csrfProtection, adminSlidesRouter);
  api.use('/admin/faqs', csrfProtection, adminFaqsRouter);
  api.use('/admin/show-info', csrfProtection, adminShowInfoRouter);
  api.use('/admin/ticket-types', csrfProtection, adminTicketTypesRouter);
  api.use('/admin/guests', csrfProtection, adminGuestsRouter);
  api.use('/admin/nav', csrfProtection, adminNavRouter);
  api.use('/admin/pages', csrfProtection, adminPagesRouter);
  api.use('/admin/uploads', csrfProtection, adminUploadsRouter);

  app.use('/api/v1', api);

  // SEO helpers.
  app.get('/sitemap.xml', sitemapHandler);
  app.get('/robots.txt', robotsHandler);

  // Serve the built SPA with per-route OG/Twitter meta injected at the origin
  // (§7.0b). Mounted only when a production build exists; in dev, Vite serves
  // the SPA and proxies /api here.
  const here = path.dirname(fileURLToPath(import.meta.url));
  const distDir = path.resolve(here, '../../client/dist');
  const indexPath = path.join(distDir, 'index.html');
  if (existsSync(indexPath)) {
    const indexHtml = readFileSync(indexPath, 'utf8');
    app.use(express.static(distDir, { index: false, maxAge: '1y' }));
    app.get('*', async (req, res, next) => {
      if (req.path.startsWith('/api') || req.path.startsWith('/uploads')) return next();
      try {
        const meta = await getMetaForPath(req.path);
        res
          .set('Content-Type', 'text/html; charset=utf-8')
          .set('Cache-Control', 'no-cache')
          .send(injectMeta(indexHtml, meta, res.locals.cspNonce));
      } catch {
        res.type('html').send(indexHtml);
      }
    });
  }

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
