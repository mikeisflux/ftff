# Convention Platform — Build Specification

> **Purpose of this document:** A complete, self-contained build brief for **Claude Code** to implement a production-grade convention website with a full admin suite. Build in phases (see §17). Treat every "MUST" as a hard requirement and every "SHOULD" as a strong default. Where this doc says **CONFIRM**, surface the decision before implementing.

---

## 1. Project Overview

A top-of-the-line website for a fan convention (reference brand: *FAN EXPO Chicago*) consisting of:

- A **public marketing + commerce site** (mobile-first, 100% responsive).
- **Ticketing** with QR-based mobile tickets and on-site validation.
- **Vendor booth sales** via an interactive, uploaded floor-plan picker.
- A **merch/e-commerce store**.
- A **Virtual Con Experience** — a gated livestream section fed by an RTMP ingest.
- A **full admin panel** (CRUD for all content) including a **Gmail-style email client**.
- A **Settings panel** controlling every API key and site section, using a deliberate *click-to-set → click-to-confirm* save pattern.
- **Stripe** for all payments; **SendGrid** for all email; **Cloudflare Stream** for video.
- Rigorous security posture (see §4).

---

## 2. Tech Stack (pinned)

| Layer | Choice | Version |
|---|---|---|
| Runtime | Node.js | **26.3.0** |
| Frontend | React | **19.2.7** |
| Database | PostgreSQL | **18.4** |

> **CONFIRM at build time** that these exact versions resolve from the registries. If a pinned version is unavailable on the build machine, stop and report rather than silently downgrading.

**Recommended supporting libraries** (adjust as needed, keep dependency surface small):

- **Frontend:** Vite, React Router, TanStack Query (server state), Zod (validation), Tailwind CSS, `hls.js` (livestream playback), `@stripe/react-stripe-js` + `@stripe/stripe-js`.
- **Backend:** Express (or Fastify), `pg` (no ORM required; if one is used, Drizzle preferred over Prisma for raw-SQL friendliness), `zod`, `jsonwebtoken`, `argon2` (password hashing), `helmet`, `express-rate-limit`, `stripe`, `@sendgrid/mail`, `qrcode`.
- **Tooling:** ESLint, Prettier, Vitest/Playwright for tests, `dotenv` for local env only.

**Repo layout:** monorepo.
```
/client      React app (public site + admin SPA)
/server      Node API + webhooks + jobs
/server/db   schema.sql, migrations, seed.sql
/infra       deploy notes, env templates
```

---

## 3. Architecture

- **API style:** REST, JSON. Versioned under `/api/v1`.
- **Auth:**
  - **Admin/staff:** email + password (argon2), short-lived JWT access token in an **httpOnly, Secure, SameSite=Strict cookie** + rotating refresh token. No tokens in localStorage.
  - **Customers:** guest checkout by default (no account required to buy). Optional accounts are out of scope for v1 unless requested.
- **Roles:** `admin` (everything), `editor` (content only), `door_staff` (ticket validation app only).
- **Background jobs:** a small queue (BullMQ + Redis, or pg-boss if avoiding Redis) for sending email, syncing inbound mail, and expiring booth holds.
- **File uploads** (slider images, headshots, floor plan, product images): store in object storage (S3-compatible / Cloudflare R2), serve via CDN. Never store binaries in Postgres.

---

## 4. Security & Compliance — **highest priority**

> **Honesty note for the implementer:** "100% attack-proof" is not an achievable absolute — no system is. This section defines a rigorous, defense-in-depth baseline that meets recognized standards and minimizes attack surface. Treat it as mandatory.

### 4.1 PCI-DSS
- **Target SAQ A** (smallest scope). The application **MUST NOT** transmit, process, or store raw card data (PAN, CVV, expiry). All card entry happens inside **Stripe-hosted fields** — Stripe Checkout (redirect) or Stripe Elements/Payment Element (iframe-isolated). Card data goes browser → Stripe directly; our servers only ever see Stripe tokens/IDs.
- No card numbers in logs, DB, analytics, or error reports — ever.
- Document the SAQ A scope decision in `/infra/SECURITY.md`.

### 4.2 Transport & headers
- HTTPS everywhere; HSTS (`max-age` ≥ 1 year, `includeSubDomains`, `preload`).
- `helmet` with a strict **Content-Security-Policy**. Allowlist only required origins (Stripe JS, Cloudflare Stream, SendGrid pixels, your CDN). No `unsafe-inline` for scripts — use nonces/hashes.
- `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` locked down, `X-Frame-Options`/`frame-ancestors` to prevent clickjacking.

### 4.3 Application hardening (OWASP Top 10)
- **Injection:** parameterized queries only; never string-concatenate SQL. Validate/normalize all input with Zod at the boundary.
- **AuthN/Z:** argon2id password hashing; enforce per-route role checks server-side (never trust the client). Login + sensitive endpoints rate-limited and protected against brute force (lockout/backoff).
- **CSRF:** double-submit cookie or SameSite=Strict + custom header check for all state-changing requests.
- **XSS:** escape all output; sanitize any admin-authored HTML (CMS pages, email bodies) with a server-side sanitizer (e.g., DOMPurify on a JSDOM, allowlist tags).
- **SSRF/file upload:** validate MIME + magic bytes, re-encode images, cap sizes, randomized object keys, no user-controlled fetch URLs.
- **Secrets:** never in the repo. Runtime via environment/secret manager. API secrets stored in the DB (settings panel) are **encrypted at rest** with AES-256-GCM keyed by a master key held only in the environment (see §5).
- **Webhooks:** verify **Stripe** signatures (`whsec_…`) and **SendGrid Inbound Parse** authenticity before trusting payloads. Reject unsigned/replayed events (idempotency keys + event-ID dedupe).
- **Rate limiting & WAF:** global rate limits; put Cloudflare (WAF + bot management + DDoS) in front of the origin.
- **Audit logging:** record admin actions (who/what/when) to an append-only `audit_log` table. No secrets in logs.
- **Dependencies:** lockfiles committed; CI runs `npm audit`/Snyk; Dependabot enabled.
- **Backups:** automated encrypted Postgres backups + tested restore.

### 4.4 Privacy
- Cookie consent banner; document data retention. PII access restricted by role.

---

## 5. Secrets & the Settings "Save-State" pattern

All third-party keys and per-section config live in a `settings` table and are managed in the admin **Settings panel**.

**Storage rules**
- Each setting has: `key`, `category`, `label`, `description`, `is_secret`, `is_set`, and either `value` (plaintext, non-secret) or `value_enc` (AES-256-GCM blob, secret).
- **Secret values are never returned to the browser.** The API returns only `is_set: true/false` and a masked placeholder (`••••••••`).

**UX (must match this interaction):**
1. Field renders in a **locked/read-only** state showing either a masked value (secret, already set), the current value (non-secret), or empty.
2. User clicks a **"Set / Edit"** affordance → the field becomes an editable input ("click a box to set it").
3. User types the value, then clicks **"Confirm & Save"** → value is validated, encrypted if secret, persisted; field returns to locked state showing "Saved ✓".
4. A **"Clear"** action removes a stored secret (sets `is_set=false`).
- Unsaved edits are visually marked "unsaved"; navigating away warns.
- Every save writes an `audit_log` entry (key changed, by whom — **not** the value).

**Settings catalog (categories → keys):**
- **Payments:** `stripe.publishable_key`, `stripe.secret_key` *(secret)*, `stripe.webhook_secret` *(secret)*, `stripe.currency`.
- **Email:** `sendgrid.api_key` *(secret)*, `sendgrid.from_address`, `sendgrid.from_name`, `sendgrid.inbound_domain`, `sendgrid.inbound_webhook_secret` *(secret)*.
- **Video:** `cloudflare.account_id`, `cloudflare.stream_api_token` *(secret)*, `cloudflare.live_input_id`, `cloudflare.customer_subdomain`.
- **Integrations:** `maps.google_api_key` *(secret)*, `recaptcha.site_key`, `recaptcha.secret` *(secret)*.
- **Site & Branding:** `site.name`, `site.logo_url`; full theme/brand config lives in the `theme` table (see §6 and §13.3), not as loose keys.
- **Social / sharing:** `social.share_url` (canonical URL to share), `social.default_og_image_url`, `social.x_handle`, `social.facebook_app_id`, plus profile URLs (`social.facebook_url`, `social.instagram_url`, etc.).
- **Vendors:** `vendor.floorplan_url`, `vendor.hold_minutes`.

---

## 6. Data Model (Postgres)

Implement as `schema.sql` + migrations. Use `gen_random_uuid()` PKs, `TIMESTAMPTZ`, `CITEXT` for emails, and CHECK constraints on enums.

Core tables:

- `users` — admin/staff accounts; `role`, `password_hash`, `is_active`, `last_login_at`.
- `theme` — single-row site theme/branding config (drives CSS variables sitewide; see §13.3): color **tokens** (`primary`, `secondary`, `accent`, `background`, `surface`, `text`, `muted`, `success`, `danger`, plus optional separate light/dark values), `glow_color`, `glow_intensity` (0–100), `font_display`, `font_body`, `radius`, `default_mode` (`dark`|`light`, default `dark`), `allow_user_toggle` (bool), `logo_url`, `logo_dark_url`, `logo_light_url`, `favicon_url`, `updated_at`, `updated_by`. Stored as typed columns or a validated `tokens jsonb` — implementer's choice, but values must be validated/sanitized (no CSS injection).
- `brand_assets` — uploaded brand files (logos, wordmarks, brand-guide PDFs, sponsor logos, graphics): `id`, `kind` (`logo|wordmark|favicon|graphic|document|other`), `label`, `file_url`, `mime`, `width`, `height`, `created_at`. Served from CDN via the standard upload pipeline.
- `audit_log` — `actor_id`, `action`, `entity`, `entity_id`, `meta jsonb`, `created_at`.
- `settings` — see §5.
- `slides` — hero slider: `title`, `subtitle`, `image_url`, `cta_label`, `cta_url`, `sort_order`, `is_active`.
- `show_info` — single-row: name, tagline, dates, venue, full address, lat/lng, `hours_json`.
- `guests` — `name`, `known_for`, `bio`, `headshot_url`, `category`, `is_featured`, `sort_order`, `is_active`.
- `ticket_types` — the **five fixed types** (see §8): `code` (`friday|saturday|sunday|three_day|digital`), `name`, `description`, `price_cents`, `currency`, `valid_dates`, `is_digital`, `quantity_total`, `quantity_sold`, `is_active`.
- `orders` — `order_number`, customer contact, `kind` (`ticket|vendor|store|mixed`), `subtotal_cents`, `total_cents`, `status` (`pending|paid|failed|refunded|cancelled`), `stripe_session_id`, `stripe_payment_intent`, `paid_at`.
- `tickets` — one row per issued ticket: `order_id`, `ticket_type_id`, `attendee_name`, **`qr_token` (unique, unguessable)**, `status` (`valid|checked_in|void`), `checked_in_at`, `checked_in_by`.
- `booths` — vendor floor: `label`, `zone`, `price_cents`, normalized `pos_x/pos_y/width/height` (0–1 overlay coords), `status` (`available|held|sold|blocked`), `held_until`, `order_id`.
- `products`, `product_variants` — store: title, description, images, `price_cents`, `inventory`, `is_active`, options (size/etc.).
- `order_items` — line items linking orders to products/variants/tickets/booths.
- `nav_menu` — admin-editable top menu (two-level mega-menu): `id`, `parent_id` (self-ref, NULL = top level), `label`, `route` (internal path, e.g. `/buy-tickets`) **or** `url` (external), `sort_order`, `is_cta` (highlight, e.g. Buy Tickets), `opens_new_tab`, `is_active`, `created_at`, `updated_at`. A NULL `parent_id` with no children renders as a plain link (e.g. *About Us*). Enforce: exactly one of `route`/`url` set; max depth 2.
- `pages` — CMS pages, **block-based** (see §13.1): `slug`, `title`, `blocks jsonb` (ordered array of block objects — the source of truth), `body_html` (rendered/sanitized cache for fast public serving), `seo_title`, `seo_description`, `og_image_url`, `is_published`, `published_at`, `updated_at`. Any existing HTML-only page migrates into a single `html` block.
- `faqs` — `question`, `answer`, `sort_order`, `is_active`.
- `newsletter_subscribers` — `email`, `status`.
- `contact_messages` — `kind` (`contact|media|exhibitor`), name/email/company/subject/message, `meta jsonb`, `is_read`.
- `email_messages` — Gmail-style client store (see §12).

---

## 7. Public Site

**Global requirements**
- **Mobile-first, 100% responsive** — must be fully usable and attractive on phones; test at 360px width up to wide desktop.
- **Aesthetic direction: futuristic, graphics-heavy, glowing.** Lean hard into a sci-fi/cyber convention look — neon glows and bloom, gradient meshes, glassmorphism/translucent surfaces, subtle animated backgrounds (particles, grid/scanlines, aurora), glowing borders and hover states, depth via layered shadows and parallax. Bold display typography. Heavy on motion and atmosphere while staying performant (GPU-friendly CSS, lazy/deferred effects, respects `prefers-reduced-motion`). All colors/glow pull from the live theme tokens (§13.3) — never hard-code hex.
- **Dark mode by default**, with a **light/dark toggle in the header** (see §7.0a). Persist the user's choice; honor the theme's `default_mode` for first-time visitors.
- Accessible: semantic HTML, keyboard nav, focus states, alt text, **WCAG 2.1 AA contrast in both modes** (glow effects must not break legibility), reduced-motion support.

### 7.0 Primary navigation (top menu / mega-menu)

A persistent header with a **mega-menu**: seven top-level items, each (except *About Us*) opening a dropdown of child pages. **Desktop:** hover/click dropdowns. **Mobile:** hamburger → full-screen accordion drawer. Highlight **Buy Tickets** as a prominent CTA. Nav items and ordering are **admin-editable**, stored in the `nav_menu` table (§6) and managed via a drag-to-reorder CRUD screen in the admin panel; the structure below is the launch default (seed it on first run). Changes are audit-logged like all other admin actions.

The header also carries two persistent controls (both visible on mobile):

**7.0a Theme toggle (dark/light).** A glowing sun/moon toggle in the header. Defaults to **dark**; switching applies the theme's light token set instantly (no reload) by swapping CSS variables on `:root`/`data-theme`. Persist to `localStorage`; first-time visitors get `theme.default_mode` (falling back to `prefers-color-scheme` only if the theme allows). To avoid a flash of the wrong theme, set the initial `data-theme` via a tiny inline script / SSR before paint. If `theme.allow_user_toggle` is false, lock to the default mode and hide the toggle.

**7.0b One-click social share.** A share button in the header that shares the site in one click:
- **Mobile / supported browsers:** use the native **Web Share API** (`navigator.share`) for a true one-tap OS share sheet.
- **Fallback (desktop):** a popover with one-click targets — **X/Twitter, Facebook, LinkedIn, Reddit, WhatsApp, Email, and Copy Link** — each opening the platform's share intent prewired with the canonical URL (`social.share_url`) and title.
- **Open Graph / Twitter Cards (must be correct so previews render):** every public route emits proper meta tags — `og:title`, `og:description`, `og:image` (≥1200×630), `og:url`, `og:type`, `og:site_name`, `fb:app_id` (`social.facebook_app_id`), and Twitter `summary_large_image` with `twitter:site` (`social.x_handle`). Per-page overrides come from the page's SEO/OG fields (§6 `pages`); otherwise fall back to `social.default_og_image_url`.
  - **CRITICAL (SPA caveat):** social crawlers (Facebook, X) do **not** execute JavaScript, so client-rendered React `<head>` tags won't be seen. OG/Twitter tags **MUST be server-rendered/injected per route** — via SSR, a prerender layer, or origin meta-injection middleware keyed on path. Validate with the Facebook Sharing Debugger and X Card Validator. (CONFIRM rendering approach — SSR vs. prerender.)

Each child is a buildable route/page; reuse pages already defined elsewhere rather than duplicating (e.g. *Buy Tickets* → ticketing §8, *Floor Plan* → vendor floor §9, *Shop* → store §10, *Accessibility* / *Media Inquiries* → existing pages/forms §7.2).

**Shop**
- Buy Tickets → `/buy-tickets`
- Special Experiences → `/special-experiences`
- Photo Ops → `/photo-ops`
- Autographs → `/autographs`
- Discounts & Coupons → `/discounts-coupons`
- Shop → `/shop`

**Guests**
- All Guests → `/all-guests`
- Celebrities → `/celebrities`
- Animation Voices → `/animation-voices`
- Anime Guests → `/anime-guests`
- Gaming Stars → `/gaming-stars`
- Comic Creators → `/comic-creators`
- Cosplayers → `/cosplayers`
- Suggest a Guest → `/suggest-a-guest` (form)

> Guest category pages (Celebrities, Animation Voices, etc.) are filtered views of the `guests` table by `category`. Add the categories above as allowed values for `guests.category`.

**Attractions**
- Main Events → `/main-events`
- Comics → `/comics`
- Cosplay → `/cosplay`
- Gaming → `/gaming`
- Family → `/family`
- Community Zone → `/community-zone`
- Horror → `/horror`
- After Hours Events → `/after-hours-events`

**Plan Your Visit**
- Getting Here → `/getting-here`
- Schedule → `/schedule`
- Travel & Hotels → `/travel-hotels`
- Floor Plan → `/floor-plan`
- Accessibility → `/accessibility`
- Show Guides → `/show-guides`

**Apply**
- Crew → `/crew`
- Professional Creators → `/professional-creators`
- Cosplay Guest → `/cosplay-guest`
- Panel Submission → `/panel-submission`
- Media Inquiries → `/media-inquiries`
- Want to Exhibit? → `/become-an-exhibitor`
- Community → `/community`

**Exhibitors / Industry**
- Become an Exhibitor → `/become-an-exhibitor`
- Retailers → `/retailers`
- Artist Alley → `/artist-alley`
- Corporate → `/corporate`
- Advertise → `/advertise`
- Exhibitor Rewards → `/exhibitor-rewards`
- Social Media Tool Kit → `/social-media-tool-kit`
- Past Exhibitors → `/past-exhibitors`

**About Us** → `/about-us` *(no dropdown)*

Most of these are CMS-managed content pages (`pages` table) except where they map to functional sections (tickets, shop, guests filters, floor plan) or forms (Suggest a Guest, Panel Submission, Crew/Creator/Cosplay applications, Media Inquiries, Become an Exhibitor). Application/submission forms route to `contact_messages` with an appropriate `kind`, or dedicated tables if richer fields are needed.

### 7.1 Main convention page (in vertical order)
1. **Hero slider (top):** full-featured carousel from `slides` — autoplay with pause-on-hover, swipe on touch, arrows + dots, lazy-loaded responsive images, optional CTA button per slide.
2. **Show information & location:** dates, venue name, full address, an embedded map (Google Maps via `maps.google_api_key`), and show hours from `show_info.hours_json`.
3. **Buy tickets:** the five ticket types as cards with price + "Add"/"Buy"; routes into the ticket checkout (§8).
4. **Guests:** grid limited to **exactly 8 featured headshots** (`guests.is_featured`, ordered by `sort_order`). Below the tiles, a **"View More Guests"** button → full guests page.

### 7.2 Footer — "Customer Service" links
Build out each page. Map to these routes/slugs (reference URLs from the brief shown for content parity):
- **Show Hours** → `/show-hours`
- **Contact Us** → `/contact-us` (form → `contact_messages`, kind=`contact`)
- **Newsletter Sign Up** → `/sign-up` (→ `newsletter_subscribers`, double opt-in via SendGrid)
- **Media Inquiries** → `/media-inquiries` (form → kind=`media`)
- **Exhibitor Applications** → `/become-an-exhibitor` (form → kind=`exhibitor`)
- **FAQs** → `/faqs` (from `faqs`)
- **Policies** → `/policies` (CMS page)
- **Accessibility** → `/accessibility` (CMS page)

All forms: Zod validation, reCAPTCHA, rate-limited, sanitized, and they trigger an admin notification email + an applicable confirmation email to the submitter.

---

## 8. Ticketing & QR engine

**Five fixed ticket types:** `Friday`, `Saturday`, `Sunday`, `3-Day`, `Digital`.
- `Digital` is flagged `is_digital=true` and grants access to the **Virtual Con Experience** (§11) instead of (or in addition to) physical entry.

**Purchase flow**
1. Customer selects types + quantities → cart.
2. Checkout collects attendee/customer contact, creates an `orders` row (`status=pending`), and starts **Stripe** payment (§16).
3. On `checkout.session.completed` webhook (verified): mark order `paid`, **issue one `tickets` row per ticket** with a unique `qr_token` (cryptographically random, e.g. 24 random bytes hex), decrement inventory atomically.
4. Email the buyer their **mobile tickets** via SendGrid: a mobile-optimized ticket page link per ticket plus an inline QR image. Tickets render as an Apple/Google-wallet-friendly responsive page (CONFIRM if real Wallet passes `.pkpass`/Google Wallet API are required — that's an add-on).

**QR management engine**
- Each QR encodes a URL like `https://<site>/t/<qr_token>` (opaque token, not enumerable). Admin can regenerate/void tokens.
- **Validation app** (`door_staff` role, mobile web): scans QR (camera), calls `POST /api/v1/validate` with the token. Server returns ticket status and **atomically** transitions `valid → checked_in` (single-use), recording `checked_in_at`/`checked_in_by`. Re-scans show "already checked in" with timestamp. Works on flaky venue wifi (optimistic UI + server is source of truth; consider an offline cache + later sync — CONFIRM scope).
- Admin ticket dashboard: search by order/email/token, resend, void, manual check-in, live check-in counts.

---

## 9. Vendor booth selection

- Admin uploads a **floor-plan image** (`vendor.floorplan_url`) and defines booths as **normalized rectangles** (`pos_x/pos_y/width/height`, 0–1) overlaid on it, each with `label`, `zone`, `price_cents`.
- Public vendor page: renders the floor plan with interactive booth hotspots — `available` (selectable), `held`, `sold`/`blocked` (greyed). Fully responsive (pinch/zoom on mobile).
- Selecting a booth places a **soft hold** (`status=held`, `held_until = now + vendor.hold_minutes`) so two vendors can't buy the same booth mid-checkout. A background job releases expired holds.
- Vendor completes Stripe checkout → on payment, booth → `sold`, linked to the order. Vendor receives confirmation email.

---

## 10. Store / merch e-commerce

- Admin CRUD for `products` + `product_variants` (images, price, inventory, options like size).
- Public store: listing + product detail + cart. Cart can mix store items, tickets, and a booth into one Stripe checkout where sensible (or keep ticket/booth/store carts separate — **CONFIRM** preferred UX; default: unified cart).
- Inventory decremented atomically on paid webhook; oversell protection.
- Order management in admin: fulfillment status, shipping address capture for physical goods, refunds via Stripe.

---

## 11. Virtual Con Experience (livestream)

> **Technical correction baked in:** Browsers cannot play **RTMP** directly. RTMP is an **ingest/contribution** protocol. The correct architecture: encoder (OBS/hardware) pushes **RTMP → Cloudflare Stream Live Input**; Cloudflare transcodes and **delivers HLS** for browser playback. This matches the suggestion to use Cloudflare Stream.

- **Ingest:** Cloudflare Stream **Live Input** provides an RTMP(S) URL + stream key for the production team's encoder. Store `cloudflare.live_input_id` etc. in settings.
- **Playback:** a `/virtual` page plays the HLS output via `hls.js` (native HLS on Safari). Show schedule, live chat (optional — CONFIRM), and VOD of past sessions (Cloudflare Stream recordings).
- **Access gating:** the page is **gated to holders of a `Digital` ticket**. Issue a signed, expiring access token tied to the buyer's order/ticket; use **Cloudflare Stream signed URLs / signed tokens** so the stream can't be hotlinked by non-purchasers. Validate entitlement server-side on every playback-token mint.
- Admin: start/stop/label the live input, see viewer counts (Stream analytics), manage VOD library.

---

## 12. Email — SendGrid + Gmail-style admin client

> **Architecture note:** SendGrid is **outbound** (transactional + marketing) and does **not** provide an inbox. To power a Gmail-style client that shows *incoming* mail, use **SendGrid Inbound Parse** (point an MX/subdomain at SendGrid; it POSTs received emails to a verified webhook) to populate `email_messages`. (Alternative if true mailbox sync is needed: add IMAP — **CONFIRM**; default plan is SendGrid out + Inbound Parse in.)

**Outbound (all transactional + marketing email via SendGrid):**
- Ticket delivery, order confirmations, form confirmations/notifications, newsletter, password resets.
- Use SendGrid Dynamic Templates where practical; `sendgrid.api_key` from settings; verified sender/domain (SPF/DKIM/DMARC documented in `/infra`).

**Inbound:** verified Inbound Parse webhook → sanitize → store in `email_messages` (`folder=inbox`).

**Admin email client — Gmail-style layout & full CRUD:**
- **Three-pane Gmail layout:** left folder rail (Inbox, Sent, Drafts, Archive, Spam, Trash + unread counts), middle message list (sender, subject, snippet, date, star, read/unread weight), right reading pane.
- **Full CRUD:**
  - **Create/Compose** with rich text → sends via SendGrid; saves to `Sent`.
  - **Read** thread view (group by `thread_id`); mark read/unread.
  - **Update:** star, move/label, mark read, edit drafts.
  - **Delete:** to Trash, then permanent delete from Trash.
- Search across subject/body/sender; reply / reply-all / forward; attachments (stored in object storage, scanned/size-limited).
- All admin-authored HTML sanitized before send and before render.

---

## 13. Admin Panel

Single authenticated SPA (or section) gated by role. Modules:

- **Dashboard:** sales totals, tickets sold by type, check-in counts, booths sold, store revenue, recent form submissions, stream status.
- **CRUD for:** slides, guests, ticket_types (pricing/inventory), products/variants, booths + floor-plan upload, pages, faqs, show_info, **nav_menu** (drag-to-reorder mega-menu builder).
- **Orders:** tickets / vendor / store, with refunds, resend, void/check-in.
- **Submissions:** contact/media/exhibitor inboxes + newsletter list export.
- **Email client** (§12).
- **Livestream control** (§11).
- **Settings panel** (§5).
- **Users & roles** (admin only) + **audit log** viewer.
- **Page Builder** — block-based visual editor for any page (§13.1).
- **Guest Tile Manager** — upload-and-go tile manager with drag-to-reorder (§13.2).
- **Theme & Branding** — sitewide color/theme studio + brand-asset uploads (§13.3).

Every list view: search, filter, sort, pagination. Every destructive action: confirm + audit-logged. Admin UI must also be responsive/usable on tablet.

### 13.1 Block-based Page Builder

A full-page, block-style visual editor (think Gutenberg / Notion / Editor.js) in `/admin` that can open **any existing page** built on the platform and edit it into a polished layout — no code required.

- **Targets:** all `pages` rows (footer pages, mega-menu content pages, About Us, Attractions/Plan-Your-Visit pages, etc.). Functional pages (ticketing, store, vendor floor, guests grid) stay code-owned, but the builder can edit their **editable content regions** where exposed (CONFIRM which regions are opened up).
- **Storage:** edits save to `pages.blocks` (ordered JSONB). On save/publish the server renders blocks → sanitized `body_html` cache for fast, safe public serving. Block JSON is the source of truth; never trust client-rendered HTML.
- **Block library (launch set):** Heading, Rich Text, Image, Image + Text (split), Gallery/Grid, Button/CTA, Video/Embed (Cloudflare Stream or YouTube), Hero/Banner, Accordion/FAQ, Card Row, Spacer/Divider, Columns (2–4), Map, Countdown (to show dates), Guest Carousel (pulls from `guests`), Ticket Cards (pulls from `ticket_types`), Raw HTML (admin-only, sanitized).
- **Editing UX:** drag to add/reorder blocks; inline editing; per-block settings panel (padding, background, alignment, width: contained/full-bleed); duplicate/delete; keyboard accessible.
- **Layout & "make it look good":** blocks inherit the live **theme tokens** (§13.3 — fonts, colors, glow, spacing/radius scale) so output is on-brand and futuristic by default. Provide a few ready-made section presets.
- **Workflow:** autosave drafts, **live preview**, **publish/unpublish**, and a simple **version history** (snapshot `blocks` on each publish; restore a prior version). Responsive preview toggle (mobile/tablet/desktop).
- **Safety:** all rich text / raw HTML server-side sanitized (allowlist) before caching and rendering; uploaded images go through the standard upload pipeline (re-encode, size cap, CDN).

### 13.2 Guest Tile Manager

A dedicated manager for the guest tiles (celebrities, artists, and every other category) that makes adding a guest as simple as **upload a photo + write a bio → it appears as a tile**.

- **Add/Edit a guest:** drag-and-drop (or click) headshot upload with crop/preview, `name`, `known_for`, `bio` (rich text), `category` (Celebrities, Animation Voices, Anime, Gaming Stars, Comic Creators, Cosplayers, …), plus optional links/socials and appearance days. Image runs through the upload pipeline (auto-resize to a consistent tile aspect ratio, CDN-served).
- **Tile = live preview:** the editor shows the exact tile as it will render on the public Guests grid and category pages.
- **Organize by any means:**
  - **Drag-to-reorder** within a list, persisting to `guests.sort_order` (bulk-saved in one request).
  - Filter/group by `category`, featured status, active/inactive, search by name.
  - Toggle **Featured** to control the **8 tiles on the homepage** (§7.1) — enforce the max of 8 featured with a clear warning when exceeded.
  - Bulk actions: activate/deactivate, set category, feature/unfeature.
- **Reordering API:** a batch endpoint accepts the new ordered id list (and/or category) and updates `sort_order` atomically. All changes audit-logged.

### 13.3 Theme & Branding Manager

A no-code theming studio in `/admin` that controls the entire site's look from one place, persisting to the `theme` table (§6). Changes apply sitewide because every component reads CSS custom properties — never hard-coded colors.

- **Color system:** color pickers for the full token set — **Primary, Secondary, Accent**, plus Background, Surface, Text, Muted, Success, Danger, and **Glow** color + **glow intensity** slider. Edit **dark and light palettes** independently (or auto-derive light from dark with manual override). Show a contrast checker that warns on AA failures per mode.
- **Typography & shape:** choose display + body fonts (curated futuristic font list + Google Fonts), base radius, and effect intensity (how strong glows/blur/animation are globally).
- **Live preview:** a preview pane (and "open live site in preview mode") renders real components with pending changes before saving; toggle dark/light in the preview.
- **Save behavior:** uses the same click-to-edit → **confirm-to-save** pattern as Settings (§5). On save, tokens are validated/sanitized (reject anything that isn't a valid color/number/font — prevents CSS injection) and pushed to a small cached `/api/v1/theme` endpoint the public site loads (with the critical values inlined pre-paint to avoid FOUC).
- **Default mode & toggle control:** set `default_mode` (default **dark**) and whether users may switch (`allow_user_toggle`).
- **Branding uploads:** upload **logo (light & dark variants), wordmark, favicon, OG/share image, sponsor logos, and brand graphics/PDFs** → stored in `brand_assets` via the upload pipeline (re-encode, size cap, CDN). Set which assets are "active" (header logo per mode, favicon, default OG image). A brand-asset library lets admins reuse uploads across the page builder and emails.
- **Presets:** ship a few starter futuristic palettes (e.g. "Neon Cyber", "Synthwave", "Holo Mono") that one-click populate the tokens; admins can then tweak. Reset-to-default available. All changes audit-logged.


---

## 14. API surface (representative, `/api/v1`)

```
# Auth
POST   /auth/login            POST /auth/logout            POST /auth/refresh

# Public content
GET    /slides                GET  /show-info              GET  /guests?featured=true
GET    /ticket-types          GET  /products               GET  /booths
GET    /pages/:slug           GET  /faqs
GET    /theme                 # cached: active theme tokens + active logos/OG image

# Public actions
POST   /newsletter            POST /contact                POST /media-inquiry
POST   /exhibitor-application
POST   /checkout/tickets      POST /checkout/booth         POST /checkout/store
GET    /t/:qr_token           # public mobile ticket page
GET    /virtual/playback-token   # gated: requires valid Digital ticket

# Webhooks (no auth, signature-verified)
POST   /webhooks/stripe       POST /webhooks/sendgrid-inbound

# Door staff
POST   /validate              # { qr_token } -> atomic check-in

# Admin (role-gated)  — full CRUD under:
/admin/slides /admin/guests /admin/ticket-types /admin/products
/admin/booths /admin/orders /admin/pages /admin/faqs /admin/show-info
/admin/settings /admin/users /admin/audit /admin/nav
/admin/theme            (GET/PUT theme tokens + default_mode + toggle)
/admin/brand-assets     (upload/list/delete logos, favicon, OG image, graphics)
/admin/email/messages   (+ /send, /draft, /move, /star, /delete)
/admin/stream           (start/stop/status/vod)

# Page builder
GET    /admin/pages/:id              # returns blocks JSON
PUT    /admin/pages/:id              # save blocks (autosave/draft)
POST   /admin/pages/:id/publish      # render+sanitize, snapshot version
GET    /admin/pages/:id/versions     POST /admin/pages/:id/restore/:versionId

# Drag-to-reorder (batch, atomic) — guests, nav, slides, faqs, products
POST   /admin/guests/reorder         # { orderedIds:[...], category? }
POST   /admin/nav/reorder            POST /admin/slides/reorder
POST   /admin/guests/:id/upload      # headshot upload -> CDN url
```

---

## 15. Payments / Stripe

- Use **Payment Element** (Elements) or **Checkout Session** — card data never touches our server (SAQ A).
- Server creates the session/intent with server-side computed amounts (never trust client prices). Pass `metadata` linking to our `orders.id`.
- **Webhook is the source of truth** for fulfillment: handle `checkout.session.completed` / `payment_intent.succeeded`, verify signature, dedupe by event id, fulfill idempotently.
- Refunds via Stripe API from admin; reflect status back to `orders`.
- All amounts in integer cents; single currency from `stripe.currency` (multi-currency = future).

---

## 16. Environment variables (template)

```
NODE_ENV=
PORT=
CLIENT_ORIGIN=
PUBLIC_URL=
DATABASE_URL=postgresql://...        # PostgreSQL 18.4
JWT_SECRET=                          # long random
SETTINGS_MASTER_KEY=                 # 32-byte hex; encrypts secret settings at rest
REDIS_URL=                           # if BullMQ used
OBJECT_STORAGE_*                     # R2/S3 creds for uploads
```
Third-party keys (Stripe, SendGrid, Cloudflare, Maps, reCAPTCHA) are entered through the **Settings panel** and stored encrypted — **not** in `.env` (except the master key that decrypts them).

---

## 17. Build phases (suggested order for Claude Code)

1. **Foundation:** monorepo, env, Postgres schema + migrations + seed, auth (login/roles/JWT cookies), security middleware (helmet/CSP/rate-limit/CSRF), audit log.
2. **Settings panel + secrets encryption** (everything downstream depends on keys).
3. **Public main page:** layout, hero slider, show info/map, ticket cards, 8-guest grid + view-more; footer pages/CMS; forms.
4. **Payments core + Stripe webhook** (shared by tickets/booths/store).
5. **Ticketing + QR issuance + mobile ticket page + validation app.**
6. **Vendor floor-plan picker + holds + checkout.**
7. **Store + cart + fulfillment.**
8. **Email: SendGrid outbound, Inbound Parse, Gmail-style admin client.**
9. **Cloudflare Stream: live input, gated HLS playback, VOD.**
10. **Admin dashboard polish, users/roles, audit viewer.**
11. **Hardening pass:** pen-test checklist, `npm audit`, CSP tightening, load test, backups, runbook.

---

## 18. Definition of Done / acceptance criteria

- [ ] All five ticket types purchasable; payment via Stripe with **no card data on our servers**; webhook-driven fulfillment is idempotent.
- [ ] Each issued ticket has a unique QR; validation is single-use and atomic; door-staff app works on mobile.
- [ ] Vendor can pick a booth from the uploaded floor plan, is protected by a hold, and checks out.
- [ ] Store products are sellable; inventory is oversell-safe.
- [ ] Digital ticket unlocks the gated Virtual Con Experience; non-buyers cannot access the HLS stream (signed tokens enforced).
- [ ] RTMP ingest → Cloudflare Stream → HLS playback verified end-to-end.
- [ ] Admin can CRUD all content; Settings panel uses click-to-set → confirm-to-save; secrets never returned to the browser.
- [ ] Gmail-style email client: compose/send (SendGrid), receive (Inbound Parse), full CRUD, search, threads.
- [ ] Footer pages all built and editable.
- [ ] Site passes mobile responsiveness from 360px up; WCAG 2.1 AA basics.
- [ ] Theme studio changes primary/secondary/accent/glow + fonts sitewide with no code; light & dark palettes both AA-legible; logo/brand/OG-image uploads work.
- [ ] Site loads in **dark mode by default** with a working, persisted light/dark header toggle and no theme-flash on load.
- [ ] One-click share works (Web Share API + desktop fallbacks); Open Graph / Twitter Card previews render correctly in the Facebook Sharing Debugger and X Card Validator (server-rendered meta).
- [ ] Security checklist (§4) satisfied; SAQ A scope documented; backups + restore tested.
- [ ] Built on Node 26.3.0, React 19.2.7, PostgreSQL 18.4.

---

## 19. Open items to CONFIRM with stakeholder

1. Real Apple/Google **Wallet passes** for tickets, or mobile web ticket page only?
2. **Unified cart** (tickets + booth + merch in one checkout) vs. separate flows?
3. **Offline mode** for the door-scanning app at the venue?
4. **Live chat** on the Virtual Con page, and is VOD (recorded sessions) in scope?
5. Inbound email via **SendGrid Inbound Parse** (default) or full **IMAP** mailbox sync?
6. Customer **accounts** (order history/login) in v1, or guest checkout only?
7. Multi-currency / international tax & shipping, or single currency + simple tax?
8. **Social meta rendering:** SSR the whole React app, or add a lightweight prerender/meta-injection layer just for crawler `<head>` tags? (Needed for OG/Twitter previews — §7.0b.)
