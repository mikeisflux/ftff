# Security Posture & SAQ A Scope

> "100% attack-proof" is not achievable for any system. This documents the
> rigorous, defense-in-depth baseline the platform implements (spec §4).

## PCI-DSS — SAQ A scope decision

This application targets **PCI-DSS SAQ A**, the smallest possible scope:

- The application **never transmits, processes, or stores raw card data**
  (PAN, CVV, expiry). All card entry happens inside **Stripe-hosted fields**
  (Stripe Checkout redirect, or Stripe Elements / Payment Element iframes).
- Card data flows **browser → Stripe directly**. Our servers only ever see
  Stripe tokens / IDs (`cs_…`, `pi_…`), never card numbers.
- No card numbers appear in logs, the database, analytics, or error reports.
- Server-side amounts are authoritative; the client never sets prices.
- Fulfillment is driven by **signature-verified Stripe webhooks**, deduplicated
  by event id (`webhook_events` table) and applied idempotently.

## Transport & headers (§4.2)

- HTTPS everywhere; HSTS (`max-age` ≥ 1 year, `includeSubDomains`, `preload`)
  enabled in production (`server/src/middleware/security.js`).
- Strict CSP with a per-request **nonce** for scripts — no `unsafe-inline` for
  scripts. Allowlist: Stripe JS, Cloudflare Stream, Google Maps, our CDN.
- `X-Content-Type-Options: nosniff`, `Referrer-Policy:
  strict-origin-when-cross-origin`, locked `Permissions-Policy`,
  `frame-ancestors 'none'` (clickjacking).

## Application hardening (OWASP Top 10, §4.3)

- **Injection:** parameterized queries only (`pg` placeholders); Zod validation
  at every boundary.
- **AuthN/Z:** argon2id password hashing; short-lived JWT access token in an
  httpOnly/Secure/SameSite=Strict cookie + rotating refresh token; per-route
  role checks server-side; login lockout/backoff + rate limiting.
- **CSRF:** SameSite=Strict + double-submit token (`X-CSRF-Token` header vs
  `csrf_token` cookie) on state-changing admin requests.
- **XSS:** all admin-authored HTML sanitized server-side (DOMPurify on JSDOM,
  allowlist) before caching and before render.
- **Secrets:** never in the repo. Third-party API keys live in the `settings`
  table **encrypted at rest with AES-256-GCM**, keyed by `SETTINGS_MASTER_KEY`
  held only in the environment. Secret values are never returned to the browser.
- **Webhooks:** Stripe + SendGrid Inbound Parse signatures verified; replayed
  events rejected via event-id dedupe.
- **Audit logging:** admin actions recorded to append-only `audit_log` (who /
  what / when) — never secret values.

## Secrets inventory

| Secret | Location | Notes |
|---|---|---|
| `SETTINGS_MASTER_KEY` | environment only | 32-byte hex; decrypts settings |
| `JWT_SECRET` | environment only | signs access tokens |
| `DATABASE_URL` | environment / secret manager | — |
| Stripe / SendGrid / Cloudflare / Maps / reCAPTCHA keys | `settings.value_enc` (encrypted) | entered via admin Settings panel |

## Outstanding (later phases)

- reCAPTCHA on public forms; Cloudflare WAF/bot-management in front of origin.
- Automated encrypted Postgres backups + tested restore.
- `npm audit` / Snyk in CI; Dependabot.
- Upload pipeline: MIME + magic-byte validation, image re-encode, randomized
  object keys.
