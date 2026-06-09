# Convention Platform

Production-grade convention website + admin suite (FAN EXPO-style). Built from
[`convention-platform-spec.md`](./convention-platform-spec.md) in phases (§17).

## Status — all §17 build phases complete

| # | Phase (§17) | Highlights |
|---|---|---|
| 1 | Foundation | monorepo, full §6 Postgres schema + seed, argon2 auth (JWT cookies + rotating refresh, role guards), Helmet/CSP/CSRF/rate-limit, audit log |
| 2 | Settings + secrets | Settings panel API, **AES-256-GCM** secret encryption at rest, click-to-set → confirm-to-save; secrets never returned to the browser |
| 3 | Public main page | mega-menu, hero carousel, show info + **embedded map**, ticket cards, 8 featured guests, footer/CMS pages, forms; dark-by-default + persisted toggle |
| 4 | Payments core | Stripe-hosted Checkout (SAQ A), server-side pricing, signature-verified webhook with idempotent fulfillment |
| 5 | Ticketing + QR | one unguessable `qr_token` per seat, mobile ticket page, **atomic single-use** door-staff validation app + admin ticket dashboard |
| 6 | Vendor floor | floor-plan booth picker, atomic soft-holds + expiry job, booth checkout, admin booth editor |
| 7 | Store | products/variants, storefront + cart, store checkout, oversell-safe inventory, shipping capture, admin product + order mgmt (refunds) |
| 8 | Email | SendGrid outbound + **Inbound Parse**, three-pane **Gmail-style** admin client (compose/reply/star/move/trash), form notifications |
| 9 | Cloudflare Stream | Digital-ticket-**gated** HLS playback (hls.js), live-input control (RTMPS ingest), VOD |
| 10 | Admin | dashboard, users & roles (last-admin protection), audit viewer, submissions inbox + newsletter export |
| 13 | Content mgmt | **Page Builder** (blocks + publish + versions), **Guest Tile Manager**, **Theme & Branding studio**, slides/FAQ/nav/show-info CRUD with drag-to-reorder; validated upload pipeline |
| 11 | Hardening | strict headers incl. Permissions-Policy, CI (audit + e2e), Dependabot, encrypted backups + restore, runbook, pen-test checklist |

**Ticket pricing:** single-day **$40**, 3-day **$80**, digital **$10**.

### Tested end-to-end
`npm test` (in `/server`) boots the API and runs 8 flow suites covering payments
→ fulfillment, QR validation, booth holds, store inventory, email, the Virtual
Con gate, admin/users, and content management — all green. The only paths that
require live third-party network (Stripe Checkout *creation*, real SendGrid
delivery, Cloudflare API) activate automatically once those keys are entered in
the Settings panel; until then they're config-gated and skip gracefully.

## Toolchain (pinned, §2)

| Layer | Version |
|---|---|
| Node.js | 26.3.0 (`engines` pin; verified to resolve on the registry) |
| React | 19.2.7 |
| PostgreSQL | 18.4 (schema is compatible with 16+) |

> Build-machine note: this repo was scaffolded on a host with Node 22 / PG 16.
> The required versions are pinned in `engines`/configs and resolve from the
> registries; run on Node 26.3.0 + PG 18.4 for production parity.

## Quick start (local)

```bash
# 1. Install
npm install

# 2. Configure env (never commit a real .env)
cp .env.example .env
#   - set DATABASE_URL to your Postgres
#   - generate JWT_SECRET:          openssl rand -hex 48
#   - generate SETTINGS_MASTER_KEY: openssl rand -hex 32

# 3. Create schema + seed
npm run db:migrate            # apply schema.sql
npm run db:seed               # apply seed.sql
npm run db:seed:admin --workspace server   # create first admin (interactive)

# 4. Run (two terminals, or use the combined dev script)
npm run dev:server            # API on :4000
npm run dev:client            # Vite on :5173 (proxies /api -> :4000)
```

Third-party keys (Stripe, SendGrid, Cloudflare, Maps, reCAPTCHA) are entered in
the admin **Settings** panel (`/admin/settings`) and stored encrypted — not in
`.env`. The only env secret is `SETTINGS_MASTER_KEY`, which decrypts them.

See [`infra/SECURITY.md`](./infra/SECURITY.md) for the security posture and
SAQ A scope.
