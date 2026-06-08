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
- React client shell, fully wired (no dead links/placeholders):
  - Header with a working two-level mega-menu (desktop dropdowns + mobile
    accordion drawer), theme toggle, one-click share; brand/logo from live data.
  - Home: real hero carousel (autoplay/pause/swipe/arrows/dots), show info +
    directions, ticket cards, featured guests.
  - Data-driven pages: Tickets (real types; checkout arrives in the payments
    phase), Guests grid + 6 category filters, FAQs, Show Hours.
  - Public forms wired to their endpoints: Contact, Newsletter, Media
    Inquiries, Exhibitor Application, Suggest a Guest.
  - CMS renderer: authored content for About/Policies/Accessibility; honest
    "in preparation" state for not-yet-authored pages.
  - Admin login + Settings panel (identity + logout).

**Phase 2 — Payments + Ticketing (done).**

- Stripe client built from the encrypted `stripe.secret_key` setting; card data
  never touches our servers (SAQ A). Currency from `stripe.currency`.
- `POST /checkout/tickets`: prices the cart **server-side** from `ticket_types`
  (client never sets prices), creates a pending order + items, opens a
  Stripe-hosted Checkout Session, returns the redirect URL.
- `POST /webhooks/stripe`: raw-body **signature verification**, event-ID dedupe
  (idempotent), fulfills `checkout.session.completed` → marks order paid, issues
  one ticket per seat with a unique unguessable `qr_token`, bumps inventory.
- `GET /t/:token`: public mobile ticket page with an inline QR (encodes the
  opaque validation URL).
- Client: real **Buy Tickets** checkout (quantity + buyer contact → Stripe),
  post-redirect **success** page (polls until paid, shows tickets), and a
  wallet-style **mobile ticket** page.
- Ticket pricing: single-day **$40**, 3-day **$80**, digital **$10**.
- Tested end-to-end (`npm test` in `/server`): server boots, a signed webhook
  drives order→paid + 3 unique tickets, replays are deduped, tampered
  signatures are rejected (400), and the ticket QR renders. (Live Checkout
  Session creation requires real Stripe keys + network and is exercised once
  keys are entered in the Settings panel.)

> Phase boundary: remaining commerce flows (store, vendor floor, livestream,
> full email client) are later phases (§17) and are presented honestly — never
> as working features — until their phase lands.

**Next phases:** vendor floor → store → email (SendGrid + Inbound Parse +
Gmail-style client) → Cloudflare Stream → door-staff validation app + admin
polish → hardening. See spec §17.

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
