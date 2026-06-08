# Convention Platform

Production-grade convention website + admin suite (FAN EXPO-style). Built from
[`convention-platform-spec.md`](./convention-platform-spec.md) in phases (§17).

## Status

**Phase 1 — Foundation (in progress).** Implemented so far:

- Monorepo layout (`/client`, `/server`, `/server/db`, `/infra`).
- Postgres schema (`server/db/schema.sql`) covering the full §6 data model, plus
  idempotent seed (`server/db/seed.sql`): theme, show info, settings catalog,
  five ticket types, the default mega-menu, footer pages, FAQs.
- Auth: argon2id passwords, short-lived JWT access token + rotating refresh
  token in httpOnly/Secure/SameSite=Strict cookies, login lockout/backoff,
  role guards (`admin` / `editor` / `door_staff`).
- Security middleware: Helmet + strict CSP (script nonces), CSRF double-submit
  on admin writes, global/auth/form rate limits, append-only audit log.
- Settings panel API with **AES-256-GCM secret encryption at rest** and the
  click-to-set → confirm-to-save UX; secrets never returned to the browser.
- Theme & Branding token API driving sitewide CSS variables; dark-by-default
  with a persisted light/dark toggle and pre-paint flash avoidance.
- Public read endpoints (slides, show-info, guests, ticket-types, faqs, nav,
  pages/:slug) + guest form posts (newsletter/contact/media/exhibitor).
- React client shell: header (mega-menu, theme toggle, one-click share),
  home page (hero, show info, ticket cards, 8 featured guests), CMS page
  renderer, footer, admin login + settings panel.

**Next phases:** payments core + Stripe webhook → ticketing/QR → vendor floor →
store → email (SendGrid + Inbound Parse + Gmail-style client) → Cloudflare
Stream → admin polish → hardening. See spec §17.

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
