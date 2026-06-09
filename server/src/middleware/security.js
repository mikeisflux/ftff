import helmet from 'helmet';
import crypto from 'node:crypto';
import { isProd } from '../config/env.js';

// Strict security headers + CSP (§4.2). Allowlist only required third-party
// origins (Stripe, Cloudflare Stream, Google Maps, SendGrid pixels, our CDN).
// No unsafe-inline for scripts — a per-request nonce is used instead.

export function cspNonce(req, res, next) {
  res.locals.cspNonce = crypto.randomBytes(16).toString('base64');
  next();
}

// Lock down powerful browser features we don't use (§4.2). Camera is allowed on
// same-origin only for the door-staff QR scanner.
export function permissionsPolicy(_req, res, next) {
  res.setHeader(
    'Permissions-Policy',
    'geolocation=(), microphone=(), payment=(), usb=(), magnetometer=(), gyroscope=(), camera=(self)',
  );
  next();
}

export function securityHeaders() {
  return helmet({
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: [
          "'self'",
          (req, res) => `'nonce-${res.locals.cspNonce}'`,
          'https://js.stripe.com',
          'https://maps.googleapis.com',
        ],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
        imgSrc: ["'self'", 'data:', 'blob:', 'https:'],
        connectSrc: [
          "'self'",
          'https://api.stripe.com',
          'https://*.cloudflarestream.com',
          'https://maps.googleapis.com',
        ],
        frameSrc: [
          "'self'",
          'https://js.stripe.com',
          'https://hooks.stripe.com',
          'https://maps.google.com',
          'https://www.google.com',
        ],
        mediaSrc: ["'self'", 'https://*.cloudflarestream.com', 'blob:'],
        frameAncestors: ["'none'"], // clickjacking protection
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        upgradeInsecureRequests: isProd ? [] : null,
      },
    },
    hsts: isProd
      ? { maxAge: 31_536_000, includeSubDomains: true, preload: true }
      : false,
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    crossOriginEmbedderPolicy: false, // allow Stripe / Stream iframes
  });
}
