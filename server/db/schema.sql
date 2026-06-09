-- ─────────────────────────────────────────────────────────────────────────────
-- Convention Platform — schema (§6)
-- Target: PostgreSQL 18.4 (compatible with 16+). Idempotent where practical.
-- Conventions: gen_random_uuid() PKs, TIMESTAMPTZ, CITEXT emails, CHECK enums.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE EXTENSION IF NOT EXISTS pgcrypto;  -- gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS citext;    -- case-insensitive emails

-- Helper: auto-update updated_at
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ── users (admin / staff) ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email          CITEXT UNIQUE NOT NULL,
  name           TEXT NOT NULL,
  role           TEXT NOT NULL DEFAULT 'editor'
                   CHECK (role IN ('admin','editor','door_staff')),
  password_hash  TEXT NOT NULL,
  is_active      BOOLEAN NOT NULL DEFAULT TRUE,
  last_login_at  TIMESTAMPTZ,
  failed_logins  INTEGER NOT NULL DEFAULT 0,
  locked_until   TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
DROP TRIGGER IF EXISTS trg_users_updated ON users;
CREATE TRIGGER trg_users_updated BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── refresh_tokens (rotating) ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS refresh_tokens (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash   TEXT NOT NULL,             -- sha256 of the opaque refresh token
  expires_at   TIMESTAMPTZ NOT NULL,
  revoked_at   TIMESTAMPTZ,
  replaced_by  UUID REFERENCES refresh_tokens(id),
  user_agent   TEXT,
  ip           INET,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_refresh_user ON refresh_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_refresh_hash ON refresh_tokens(token_hash);

-- ── theme (single-row site theme/branding) ───────────────────────────────────
CREATE TABLE IF NOT EXISTS theme (
  id               INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  tokens           JSONB NOT NULL DEFAULT '{}'::jsonb,  -- validated color/number/font tokens
  glow_color       TEXT,
  glow_intensity   INTEGER NOT NULL DEFAULT 60 CHECK (glow_intensity BETWEEN 0 AND 100),
  font_display     TEXT NOT NULL DEFAULT 'Orbitron',
  font_body        TEXT NOT NULL DEFAULT 'Inter',
  radius           TEXT NOT NULL DEFAULT '12px',
  default_mode     TEXT NOT NULL DEFAULT 'dark' CHECK (default_mode IN ('dark','light')),
  allow_user_toggle BOOLEAN NOT NULL DEFAULT TRUE,
  logo_url         TEXT,
  logo_dark_url    TEXT,
  logo_light_url   TEXT,
  favicon_url      TEXT,
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by       UUID REFERENCES users(id)
);

-- ── brand_assets ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS brand_assets (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind        TEXT NOT NULL CHECK (kind IN ('logo','wordmark','favicon','graphic','document','other')),
  label       TEXT,
  file_url    TEXT NOT NULL,
  mime        TEXT,
  width       INTEGER,
  height      INTEGER,
  is_active   BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── audit_log (append-only) ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS audit_log (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id    UUID REFERENCES users(id),
  action      TEXT NOT NULL,
  entity      TEXT,
  entity_id   TEXT,
  meta        JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_actor ON audit_log(actor_id);

-- ── settings (§5) ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS settings (
  key         TEXT PRIMARY KEY,
  category    TEXT NOT NULL,
  label       TEXT NOT NULL,
  description TEXT,
  is_secret   BOOLEAN NOT NULL DEFAULT FALSE,
  is_set      BOOLEAN NOT NULL DEFAULT FALSE,
  value       TEXT,        -- plaintext for non-secret settings
  value_enc   BYTEA,       -- AES-256-GCM blob for secret settings (iv||tag||ct)
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by  UUID REFERENCES users(id)
);

-- ── slides (hero slider) ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS slides (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title       TEXT,
  subtitle    TEXT,
  image_url   TEXT NOT NULL,
  cta_label   TEXT,
  cta_url     TEXT,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
DROP TRIGGER IF EXISTS trg_slides_updated ON slides;
CREATE TRIGGER trg_slides_updated BEFORE UPDATE ON slides
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── show_info (single-row) ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS show_info (
  id          INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  name        TEXT,
  tagline     TEXT,
  starts_on   DATE,
  ends_on     DATE,
  venue       TEXT,
  address     TEXT,
  lat         DOUBLE PRECISION,
  lng         DOUBLE PRECISION,
  hours_json  JSONB NOT NULL DEFAULT '[]'::jsonb,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── guests ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS guests (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name         TEXT NOT NULL,
  known_for    TEXT,
  bio          TEXT,
  headshot_url TEXT,
  category     TEXT NOT NULL DEFAULT 'celebrities'
                 CHECK (category IN ('celebrities','comic_creators','cosplayers','other')),
  socials      JSONB NOT NULL DEFAULT '{}'::jsonb,
  appearance_days JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_featured  BOOLEAN NOT NULL DEFAULT FALSE,
  sort_order   INTEGER NOT NULL DEFAULT 0,
  is_active    BOOLEAN NOT NULL DEFAULT TRUE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
DROP TRIGGER IF EXISTS trg_guests_updated ON guests;
CREATE TRIGGER trg_guests_updated BEFORE UPDATE ON guests
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE INDEX IF NOT EXISTS idx_guests_category ON guests(category);
CREATE INDEX IF NOT EXISTS idx_guests_featured ON guests(is_featured) WHERE is_featured;
-- Removed categories: reassign any existing guests, then tighten the constraint.
UPDATE guests SET category='other' WHERE category IN ('animation_voices','anime','gaming_stars');
ALTER TABLE guests DROP CONSTRAINT IF EXISTS guests_category_check;
ALTER TABLE guests ADD CONSTRAINT guests_category_check
  CHECK (category IN ('celebrities','comic_creators','cosplayers','other'));

-- ── ticket_types (admin-managed; five are seeded by default) ─────────────────
CREATE TABLE IF NOT EXISTS ticket_types (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code           TEXT UNIQUE NOT NULL,
  name           TEXT NOT NULL,
  description    TEXT,
  price_cents    INTEGER NOT NULL CHECK (price_cents >= 0),
  currency       TEXT NOT NULL DEFAULT 'usd',
  valid_dates    JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_digital     BOOLEAN NOT NULL DEFAULT FALSE,
  quantity_total INTEGER,                  -- NULL = unlimited
  quantity_sold  INTEGER NOT NULL DEFAULT 0,
  is_active      BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order     INTEGER NOT NULL DEFAULT 0,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
DROP TRIGGER IF EXISTS trg_ticket_types_updated ON ticket_types;
CREATE TRIGGER trg_ticket_types_updated BEFORE UPDATE ON ticket_types
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
-- Existing DBs: drop the old fixed-five enum constraint so admins can add types.
ALTER TABLE ticket_types DROP CONSTRAINT IF EXISTS ticket_types_code_check;
ALTER TABLE ticket_types ADD COLUMN IF NOT EXISTS image_url TEXT;

-- ── orders ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS orders (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number         TEXT UNIQUE NOT NULL,
  customer_name        TEXT,
  customer_email       CITEXT,
  customer_phone       TEXT,
  kind                 TEXT NOT NULL CHECK (kind IN ('ticket','vendor','store','mixed')),
  subtotal_cents       INTEGER NOT NULL DEFAULT 0,
  total_cents          INTEGER NOT NULL DEFAULT 0,
  currency             TEXT NOT NULL DEFAULT 'usd',
  status               TEXT NOT NULL DEFAULT 'pending'
                         CHECK (status IN ('pending','paid','failed','refunded','cancelled')),
  stripe_session_id    TEXT,
  stripe_payment_intent TEXT,
  shipping_address     JSONB,
  fulfillment_status   TEXT NOT NULL DEFAULT 'unfulfilled'
                         CHECK (fulfillment_status IN ('unfulfilled','fulfilled','shipped','cancelled')),
  paid_at              TIMESTAMPTZ,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- For existing databases predating fulfillment_status:
ALTER TABLE orders ADD COLUMN IF NOT EXISTS fulfillment_status TEXT NOT NULL DEFAULT 'unfulfilled';
DROP TRIGGER IF EXISTS trg_orders_updated ON orders;
CREATE TRIGGER trg_orders_updated BEFORE UPDATE ON orders
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE INDEX IF NOT EXISTS idx_orders_email ON orders(customer_email);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_session ON orders(stripe_session_id);

-- ── tickets ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tickets (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id        UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  ticket_type_id  UUID NOT NULL REFERENCES ticket_types(id),
  attendee_name   TEXT,
  qr_token        TEXT UNIQUE NOT NULL,    -- cryptographically random, unguessable
  status          TEXT NOT NULL DEFAULT 'valid'
                    CHECK (status IN ('valid','checked_in','void')),
  checked_in_at   TIMESTAMPTZ,
  checked_in_by   UUID REFERENCES users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_tickets_order ON tickets(order_id);
CREATE INDEX IF NOT EXISTS idx_tickets_qr ON tickets(qr_token);

-- ── booths (vendor floor) ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS booths (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  label       TEXT NOT NULL,
  zone        TEXT,
  price_cents INTEGER NOT NULL CHECK (price_cents >= 0),
  pos_x       DOUBLE PRECISION NOT NULL CHECK (pos_x BETWEEN 0 AND 1),
  pos_y       DOUBLE PRECISION NOT NULL CHECK (pos_y BETWEEN 0 AND 1),
  width       DOUBLE PRECISION NOT NULL CHECK (width BETWEEN 0 AND 1),
  height      DOUBLE PRECISION NOT NULL CHECK (height BETWEEN 0 AND 1),
  status      TEXT NOT NULL DEFAULT 'available'
                CHECK (status IN ('available','held','sold','blocked')),
  held_until  TIMESTAMPTZ,
  order_id    UUID REFERENCES orders(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
DROP TRIGGER IF EXISTS trg_booths_updated ON booths;
CREATE TRIGGER trg_booths_updated BEFORE UPDATE ON booths
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE INDEX IF NOT EXISTS idx_booths_status ON booths(status);

-- ── products / variants (store) ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS products (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug        TEXT UNIQUE NOT NULL,
  section     TEXT NOT NULL DEFAULT 'shop',  -- shop|special_experiences|autographs|photo_ops|discounts
  title       TEXT NOT NULL,
  description TEXT,
  images      JSONB NOT NULL DEFAULT '[]'::jsonb,
  price_cents INTEGER NOT NULL CHECK (price_cents >= 0),
  currency    TEXT NOT NULL DEFAULT 'usd',
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- For existing databases predating product sections:
ALTER TABLE products ADD COLUMN IF NOT EXISTS section TEXT NOT NULL DEFAULT 'shop';
CREATE INDEX IF NOT EXISTS idx_products_section ON products(section);
DROP TRIGGER IF EXISTS trg_products_updated ON products;
CREATE TRIGGER trg_products_updated BEFORE UPDATE ON products
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS product_variants (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id  UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  sku         TEXT UNIQUE,
  options     JSONB NOT NULL DEFAULT '{}'::jsonb,   -- e.g. { "size": "L" }
  price_cents INTEGER,                               -- NULL => inherit product price
  inventory   INTEGER NOT NULL DEFAULT 0,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_variants_product ON product_variants(product_id);

-- ── order_items ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS order_items (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id      UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  kind          TEXT NOT NULL CHECK (kind IN ('ticket','booth','product')),
  ticket_type_id UUID REFERENCES ticket_types(id),
  booth_id      UUID REFERENCES booths(id),
  product_id    UUID REFERENCES products(id),
  variant_id    UUID REFERENCES product_variants(id),
  description   TEXT,
  unit_price_cents INTEGER NOT NULL,
  quantity      INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);

-- ── nav_menu (two-level mega-menu) ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS nav_menu (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id     UUID REFERENCES nav_menu(id) ON DELETE CASCADE,
  label         TEXT NOT NULL,
  route         TEXT,   -- internal path
  url           TEXT,   -- external url
  sort_order    INTEGER NOT NULL DEFAULT 0,
  is_cta        BOOLEAN NOT NULL DEFAULT FALSE,
  opens_new_tab BOOLEAN NOT NULL DEFAULT FALSE,
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- exactly one of route/url set
  CONSTRAINT nav_route_xor_url CHECK ((route IS NOT NULL) <> (url IS NOT NULL))
);
DROP TRIGGER IF EXISTS trg_nav_updated ON nav_menu;
CREATE TRIGGER trg_nav_updated BEFORE UPDATE ON nav_menu
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE INDEX IF NOT EXISTS idx_nav_parent ON nav_menu(parent_id);

-- ── pages (block-based CMS, §13.1) ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pages (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug            TEXT UNIQUE NOT NULL,
  title           TEXT NOT NULL,
  blocks          JSONB NOT NULL DEFAULT '[]'::jsonb,  -- source of truth
  body_html       TEXT,                                 -- sanitized render cache
  seo_title       TEXT,
  seo_description  TEXT,
  og_image_url    TEXT,
  is_published    BOOLEAN NOT NULL DEFAULT FALSE,
  published_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
DROP TRIGGER IF EXISTS trg_pages_updated ON pages;
CREATE TRIGGER trg_pages_updated BEFORE UPDATE ON pages
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── page_versions (publish history) ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS page_versions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id     UUID NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
  blocks      JSONB NOT NULL,
  created_by  UUID REFERENCES users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_page_versions_page ON page_versions(page_id, created_at DESC);

-- ── faqs ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS faqs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question    TEXT NOT NULL,
  answer      TEXT NOT NULL,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
DROP TRIGGER IF EXISTS trg_faqs_updated ON faqs;
CREATE TRIGGER trg_faqs_updated BEFORE UPDATE ON faqs
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── newsletter_subscribers ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS newsletter_subscribers (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email        CITEXT UNIQUE NOT NULL,
  status       TEXT NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending','subscribed','unsubscribed')),
  confirm_token TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
DROP TRIGGER IF EXISTS trg_newsletter_updated ON newsletter_subscribers;
CREATE TRIGGER trg_newsletter_updated BEFORE UPDATE ON newsletter_subscribers
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── contact_messages ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS contact_messages (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind        TEXT NOT NULL DEFAULT 'contact'
                CHECK (kind IN ('contact','media','exhibitor')),
  name        TEXT,
  email       CITEXT,
  company     TEXT,
  subject     TEXT,
  message     TEXT,
  meta        JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_read     BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_contact_kind ON contact_messages(kind);

-- ── applications (Apply / submission forms, §7.0) ────────────────────────────
CREATE TABLE IF NOT EXISTS applications (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind        TEXT NOT NULL CHECK (kind IN
                ('panel','crew','creator','cosplay_guest','community','suggest_guest','volunteer')),
  name        TEXT,
  email       CITEXT,
  subject     TEXT,
  message     TEXT,
  details     JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_read     BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_applications_kind ON applications(kind, created_at DESC);

-- ── email_messages (Gmail-style client, §12) ──────────────────────────────────
CREATE TABLE IF NOT EXISTS email_messages (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id    UUID,
  folder       TEXT NOT NULL DEFAULT 'inbox'
                 CHECK (folder IN ('inbox','sent','drafts','archive','spam','trash')),
  direction    TEXT NOT NULL DEFAULT 'inbound'
                 CHECK (direction IN ('inbound','outbound')),
  from_email   CITEXT,
  from_name    TEXT,
  to_emails    JSONB NOT NULL DEFAULT '[]'::jsonb,
  cc_emails    JSONB NOT NULL DEFAULT '[]'::jsonb,
  subject      TEXT,
  snippet      TEXT,
  body_html    TEXT,          -- sanitized
  body_text    TEXT,
  attachments  JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_read      BOOLEAN NOT NULL DEFAULT FALSE,
  is_starred   BOOLEAN NOT NULL DEFAULT FALSE,
  provider_msg_id TEXT,       -- dedupe inbound
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
DROP TRIGGER IF EXISTS trg_email_updated ON email_messages;
CREATE TRIGGER trg_email_updated BEFORE UPDATE ON email_messages
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE INDEX IF NOT EXISTS idx_email_folder ON email_messages(folder, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_thread ON email_messages(thread_id);

-- ── webhook_events (idempotency / replay protection, §4.3 §15) ───────────────
CREATE TABLE IF NOT EXISTS webhook_events (
  id          TEXT PRIMARY KEY,            -- provider event id
  provider    TEXT NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── chat_messages (Virtual Con live chat, §11) ───────────────────────────────
CREATE TABLE IF NOT EXISTS chat_messages (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room       TEXT NOT NULL DEFAULT 'virtual',
  handle     TEXT NOT NULL,
  body       TEXT NOT NULL,
  role       TEXT NOT NULL DEFAULT 'viewer' CHECK (role IN ('viewer','staff')),
  ip         INET,
  is_hidden  BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_chat_room ON chat_messages(room, created_at DESC);

-- ── BotBlock firewall (integrated from botblock-firewall, §4.3) ───────────────
-- Quoted CamelCase identifiers MUST match infra/botblock-firewall/{database.sql,
-- botblock-sync.sh}. The app writes here; the root watcher applies iptables DROP
-- rules and the sync cron reconciles the firewall with these rows.
CREATE TABLE IF NOT EXISTS "BlockedIP" (
  "id"             TEXT NOT NULL PRIMARY KEY,
  "ipAddress"      TEXT NOT NULL UNIQUE,
  "reason"         TEXT NOT NULL,
  "violationCount" INTEGER NOT NULL DEFAULT 1,
  "blockedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt"      TIMESTAMP(3) NOT NULL,
  "lastUserAgent"  TEXT,
  "lastPath"       TEXT,
  "lastActionId"   TEXT,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "BlockedIP_ipAddress_idx" ON "BlockedIP"("ipAddress");
CREATE INDEX IF NOT EXISTS "BlockedIP_expiresAt_idx" ON "BlockedIP"("expiresAt");

CREATE TABLE IF NOT EXISTS "SuspiciousActivity" (
  "id"            TEXT NOT NULL PRIMARY KEY,
  "ipAddress"     TEXT NOT NULL,
  "reason"        TEXT NOT NULL,
  "actionId"      TEXT,
  "path"          TEXT,
  "userAgent"     TEXT,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "SuspiciousActivity_ipAddress_idx" ON "SuspiciousActivity"("ipAddress");
CREATE INDEX IF NOT EXISTS "SuspiciousActivity_createdAt_idx" ON "SuspiciousActivity"("createdAt");
