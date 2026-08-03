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
  font_display     TEXT NOT NULL DEFAULT 'Roboto',
  font_body        TEXT NOT NULL DEFAULT 'Roboto',
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
  image_url   TEXT,   -- optional: a slide with no image + no title shows the brand logo
  cta_label   TEXT,
  cta_url     TEXT,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Allow logo-only slides (no background image) for existing databases.
ALTER TABLE slides ALTER COLUMN image_url DROP NOT NULL;
-- Which page a slide belongs to. NULL/'home' = homepage hero; otherwise a page
-- slug (e.g. 'getting-here') so a slider can be assigned to any page.
ALTER TABLE slides ADD COLUMN IF NOT EXISTS page_slug TEXT;
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
  tier         TEXT NOT NULL DEFAULT 'featured'
                 CHECK (tier IN ('featured','special','also_appearing')),
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
-- Per-guest detail page (§7) extras: appearance pricing + an external bio link.
-- Nullable — when no pricing is set (e.g. comic creators) the detail page hides
-- the PRICING block and the Autographs/Photo Ops tiles. Added via ALTER so
-- existing databases pick them up on re-migrate.
ALTER TABLE guests ADD COLUMN IF NOT EXISTS autograph_cents         INTEGER;
ALTER TABLE guests ADD COLUMN IF NOT EXISTS autograph_premium_cents INTEGER;
ALTER TABLE guests ADD COLUMN IF NOT EXISTS photo_op_cents          INTEGER;
ALTER TABLE guests ADD COLUMN IF NOT EXISTS bio_url                 TEXT;
-- Up to 3 cover-art images (e.g. comic covers) shown in the guest's bio section.
ALTER TABLE guests ADD COLUMN IF NOT EXISTS cover_art JSONB NOT NULL DEFAULT '[]'::jsonb;
-- Optional Row-A (featured front row) table assignment; unique so no two guests
-- share a table.
ALTER TABLE guests ADD COLUMN IF NOT EXISTS table_label TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_guests_table_label ON guests(table_label) WHERE table_label IS NOT NULL;
-- Free-form booth/table label carried over when a guest is imported from a
-- vendor's exhibitor application (e.g. 'B11'). Not part of the Row-A guest-table
-- assignment above, so no uniqueness constraint.
ALTER TABLE guests ADD COLUMN IF NOT EXISTS booth_number TEXT;
CREATE INDEX IF NOT EXISTS idx_guests_category ON guests(category);
CREATE INDEX IF NOT EXISTS idx_guests_featured ON guests(is_featured) WHERE is_featured;
-- Removed categories: reassign any existing guests, then tighten the constraint.
UPDATE guests SET category='other' WHERE category IN ('animation_voices','anime','gaming_stars');
ALTER TABLE guests DROP CONSTRAINT IF EXISTS guests_category_check;
ALTER TABLE guests ADD CONSTRAINT guests_category_check
  CHECK (category IN ('celebrities','comic_creators','cosplayers','other'));
-- Guest tier (prominence) for grouped listings, for DBs predating this column.
ALTER TABLE guests ADD COLUMN IF NOT EXISTS tier TEXT NOT NULL DEFAULT 'featured';
ALTER TABLE guests DROP CONSTRAINT IF EXISTS guests_tier_check;
ALTER TABLE guests ADD CONSTRAINT guests_tier_check
  CHECK (tier IN ('featured','special','also_appearing'));

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
  shipping_cents       INTEGER NOT NULL DEFAULT 0,
  delivery_method      TEXT,   -- 'pickup' | 'ship' | NULL (digital / not applicable)
  fulfillment_status   TEXT NOT NULL DEFAULT 'unfulfilled'
                         CHECK (fulfillment_status IN ('unfulfilled','fulfilled','shipped','cancelled')),
  paid_at              TIMESTAMPTZ,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- For existing databases predating fulfillment_status:
ALTER TABLE orders ADD COLUMN IF NOT EXISTS fulfillment_status TEXT NOT NULL DEFAULT 'unfulfilled';
-- For existing databases predating store shipping/delivery:
ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipping_cents INTEGER NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_method TEXT;
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
-- Table-map extras (tier + which way the table faces) and a unique label so the
-- 140-table floor map can be seeded idempotently.
ALTER TABLE booths ADD COLUMN IF NOT EXISTS tier   TEXT;
ALTER TABLE booths ADD COLUMN IF NOT EXISTS facing TEXT;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'booths_label_key') THEN
    -- Databases seeded before `label` was unique can hold duplicate labels
    -- (old sample booths re-inserted on each re-seed). Collapse duplicates to a
    -- single row per label — preferring to keep a sold one — before adding the
    -- unique constraint.
    DELETE FROM booths a USING booths b
     WHERE a.label = b.label
       AND a.id <> b.id
       AND (
         (a.status <> 'sold' AND b.status = 'sold')
         OR (a.status = b.status AND a.ctid < b.ctid)
         OR (a.status <> 'sold' AND b.status <> 'sold' AND a.ctid < b.ctid)
       );
    ALTER TABLE booths ADD CONSTRAINT booths_label_key UNIQUE (label);
  END IF;
END $$;

-- ── vendors (public approved-exhibitor directory; admin CRUD + auto-added on
--    application approval) ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS vendors (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name           TEXT NOT NULL,
  booth_number   TEXT,
  category       TEXT,
  website        TEXT,
  application_id UUID,                         -- set when created from an approved application
  is_active      BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order     INTEGER NOT NULL DEFAULT 0,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
DROP TRIGGER IF EXISTS trg_vendors_updated ON vendors;
CREATE TRIGGER trg_vendors_updated BEFORE UPDATE ON vendors
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE INDEX IF NOT EXISTS idx_vendors_name ON vendors(lower(name));

-- ── livestream panels (schedule shown on /live-stream-panels, by day) ────────
CREATE TABLE IF NOT EXISTS panels (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title       TEXT NOT NULL,
  day         TEXT NOT NULL DEFAULT 'Friday'
                CHECK (day IN ('Friday','Saturday','Sunday')),
  start_time  TEXT,        -- free text, e.g. '2:00 PM'
  end_time    TEXT,
  location    TEXT,
  presenter   TEXT,
  description TEXT,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
DROP TRIGGER IF EXISTS trg_panels_updated ON panels;
CREATE TRIGGER trg_panels_updated BEFORE UPDATE ON panels
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE INDEX IF NOT EXISTS idx_panels_day ON panels(day, sort_order);

-- ── schedule_events (full show schedule shown on /schedule, by day) ──────────
CREATE TABLE IF NOT EXISTS schedule_events (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title       TEXT NOT NULL,
  day         TEXT NOT NULL DEFAULT 'Friday'
                CHECK (day IN ('Friday','Saturday','Sunday')),
  start_time  TEXT,        -- free text, e.g. '2:00 PM'
  end_time    TEXT,
  location    TEXT,
  category    TEXT,        -- e.g. Panel, Signing, Screening, Contest
  description TEXT,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
DROP TRIGGER IF EXISTS trg_schedule_events_updated ON schedule_events;
CREATE TRIGGER trg_schedule_events_updated BEFORE UPDATE ON schedule_events
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE INDEX IF NOT EXISTS idx_schedule_events_day ON schedule_events(day, sort_order);

-- ── image_overrides (admin-swappable images for hardcoded pages) ─────────────
-- Lets admins replace the fixed images used on bespoke pages (e.g. Exhibitor
-- Rewards, Social Media Tool Kit) without a code change. Keyed by a stable slot
-- id defined in the client registry; the page uses the override URL if present,
-- otherwise the built-in default.
CREATE TABLE IF NOT EXISTS image_overrides (
  slot        TEXT PRIMARY KEY,
  url         TEXT NOT NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
DROP TRIGGER IF EXISTS trg_image_overrides_updated ON image_overrides;
CREATE TRIGGER trg_image_overrides_updated BEFORE UPDATE ON image_overrides
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- ── products / variants (store) ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS products (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug        TEXT UNIQUE NOT NULL,
  section     TEXT NOT NULL DEFAULT 'shop',  -- shop|special_experiences|autographs|photo_ops|discounts|room_rate_guarantee|sponsorships
  title       TEXT NOT NULL,
  description TEXT,
  images      JSONB NOT NULL DEFAULT '[]'::jsonb,
  price_cents INTEGER NOT NULL CHECK (price_cents >= 0),
  currency    TEXT NOT NULL DEFAULT 'usd',
  -- 'physical' goods can be picked up at the show or shipped (shipping is a flat
  -- per-order fee by region, configured in Admin → Shipping); 'digital' is
  -- delivered electronically and never ships.
  fulfillment    TEXT NOT NULL DEFAULT 'physical' CHECK (fulfillment IN ('physical','digital')),
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- For existing databases predating product sections:
ALTER TABLE products ADD COLUMN IF NOT EXISTS section TEXT NOT NULL DEFAULT 'shop';
-- For existing databases predating physical/digital fulfillment:
ALTER TABLE products ADD COLUMN IF NOT EXISTS fulfillment TEXT NOT NULL DEFAULT 'physical';
-- Shipping moved from a per-item product fee to a flat per-order regional fee:
ALTER TABLE products DROP COLUMN IF EXISTS shipping_cents;
CREATE INDEX IF NOT EXISTS idx_products_section ON products(section);
-- Autograph/Photo-Op products auto-generated from a guest's pricing link back to
-- the guest so their detail page can offer them for sale (deleting the guest
-- removes the generated products).
ALTER TABLE products ADD COLUMN IF NOT EXISTS guest_id UUID REFERENCES guests(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_products_guest ON products(guest_id);
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
ALTER TABLE newsletter_subscribers ADD COLUMN IF NOT EXISTS name   TEXT;
ALTER TABLE newsletter_subscribers ADD COLUMN IF NOT EXISTS source TEXT;  -- where they signed up
DROP TRIGGER IF EXISTS trg_newsletter_updated ON newsletter_subscribers;
CREATE TRIGGER trg_newsletter_updated BEFORE UPDATE ON newsletter_subscribers
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── email_campaigns (marketing sends to subscribers) ────────────────────────
CREATE TABLE IF NOT EXISTS email_campaigns (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subject         TEXT NOT NULL,
  body_html       TEXT NOT NULL,
  audience        TEXT NOT NULL DEFAULT 'subscribed',
  recipient_count INTEGER NOT NULL DEFAULT 0,
  sent_count      INTEGER NOT NULL DEFAULT 0,
  status          TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','sent','sending','failed')),
  created_by      UUID REFERENCES users(id),
  sent_at         TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_email_campaigns_created ON email_campaigns(created_at DESC);

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

-- ── inventory_pools (oversell-safe add-on inventory) ─────────────────────────
-- Generic capacity pools for finite add-ons (extra tables, banquet seats, …).
-- available = total - reserved - sold. Reservations are made atomically at
-- checkout so two vendors can never buy the same table; confirmed on payment,
-- released on abandonment/cancellation.
CREATE TABLE IF NOT EXISTS inventory_pools (
  key        TEXT PRIMARY KEY,
  label      TEXT,
  total      INTEGER NOT NULL DEFAULT 0 CHECK (total >= 0),
  reserved   INTEGER NOT NULL DEFAULT 0 CHECK (reserved >= 0),
  sold       INTEGER NOT NULL DEFAULT 0 CHECK (sold >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
DROP TRIGGER IF EXISTS trg_inventory_pools_updated ON inventory_pools;
CREATE TRIGGER trg_inventory_pools_updated BEFORE UPDATE ON inventory_pools
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── exhibitor_applications (Become an Exhibitor flow) ────────────────────────
-- Full structured application + agreement + pricing snapshot + payment state.
-- Money lives here (not orders) because line items (hotel/banquet/tables) don't
-- map to order_items kinds. Deposit = 50% of booth (incl. extra tables) + 60%
-- of add-ons (hotel, banquet); balance billed later.
CREATE TABLE IF NOT EXISTS exhibitor_applications (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reference          TEXT UNIQUE NOT NULL,
  -- vendor / company / contact
  vendor_name        TEXT NOT NULL,
  product_desc       TEXT,
  num_attendees      INTEGER,
  company_name       TEXT,
  address            TEXT,
  contact_name       TEXT,
  contact_email      CITEXT NOT NULL,
  contact_phone      TEXT,
  website            TEXT,
  category           TEXT,
  -- hotel (per night)
  hotel_night1       BOOLEAN NOT NULL DEFAULT FALSE,
  hotel_night2       BOOLEAN NOT NULL DEFAULT FALSE,
  hotel_night3       BOOLEAN NOT NULL DEFAULT FALSE,
  -- booth / tables
  extra_tables       INTEGER NOT NULL DEFAULT 0 CHECK (extra_tables >= 0),
  additional_request TEXT,
  -- live streaming
  livestreaming      BOOLEAN NOT NULL DEFAULT FALSE,
  livestream_panel   BOOLEAN NOT NULL DEFAULT FALSE,
  panel_name         TEXT,
  panel_day          TEXT,
  -- banquet
  banquet            BOOLEAN NOT NULL DEFAULT FALSE,
  banquet_chicken    INTEGER NOT NULL DEFAULT 0 CHECK (banquet_chicken >= 0),
  banquet_beef       INTEGER NOT NULL DEFAULT 0 CHECK (banquet_beef >= 0),
  banquet_vegan      INTEGER NOT NULL DEFAULT 0 CHECK (banquet_vegan >= 0),
  dietary            TEXT,
  -- agreement
  signature          TEXT,
  agreed_at          TIMESTAMPTZ,
  -- pricing snapshot (cents)
  total_cents        INTEGER NOT NULL DEFAULT 0,
  deposit_cents      INTEGER NOT NULL DEFAULT 0,
  amount_paid_cents  INTEGER NOT NULL DEFAULT 0,
  balance_cents      INTEGER NOT NULL DEFAULT 0,
  breakdown          JSONB NOT NULL DEFAULT '[]'::jsonb,   -- line items snapshot
  -- booth selection + payment
  booth_id           UUID REFERENCES booths(id),
  reserved_tables    INTEGER NOT NULL DEFAULT 0,           -- tables held/sold for release accounting
  payment_method     TEXT CHECK (payment_method IN ('card','check')),
  payment_choice     TEXT CHECK (payment_choice IN ('deposit','full')),
  stripe_session_id  TEXT,
  balance_session_id TEXT,
  balance_request_sent_at TIMESTAMPTZ,
  hold_until         TIMESTAMPTZ,
  status             TEXT NOT NULL DEFAULT 'draft'
                       CHECK (status IN ('draft','awaiting_payment','check_pending',
                                         'deposit_paid','paid_in_full','cancelled')),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
DROP TRIGGER IF EXISTS trg_exhibitor_apps_updated ON exhibitor_applications;
CREATE TRIGGER trg_exhibitor_apps_updated BEFORE UPDATE ON exhibitor_applications
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE INDEX IF NOT EXISTS idx_exhibitor_apps_status ON exhibitor_applications(status);
CREATE INDEX IF NOT EXISTS idx_exhibitor_apps_email ON exhibitor_applications(contact_email);
-- Floor-map table selection + admin approval lifecycle: applicants pick tables
-- which are held until an admin approves (→ sold) or rejects (→ released).
ALTER TABLE exhibitor_applications ADD COLUMN IF NOT EXISTS booth_ids   UUID[] NOT NULL DEFAULT '{}';
ALTER TABLE exhibitor_applications ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;
ALTER TABLE exhibitor_applications ADD COLUMN IF NOT EXISTS rejected_at TIMESTAMPTZ;
-- Lock & list is a separate step from payment; track it independently.
ALTER TABLE exhibitor_applications ADD COLUMN IF NOT EXISTS is_listed   BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE exhibitor_applications ADD COLUMN IF NOT EXISTS listed_at   TIMESTAMPTZ;
ALTER TABLE exhibitor_applications ADD COLUMN IF NOT EXISTS approval_notice_sent_at TIMESTAMPTZ;
ALTER TABLE exhibitor_applications ADD COLUMN IF NOT EXISTS payment_request_sent_at TIMESTAMPTZ;
ALTER TABLE exhibitor_applications DROP CONSTRAINT IF EXISTS exhibitor_applications_status_check;
ALTER TABLE exhibitor_applications ADD CONSTRAINT exhibitor_applications_status_check
  CHECK (status IN ('draft','pending_approval','approved','rejected',
                    'awaiting_payment','check_pending','deposit_paid','paid_in_full','cancelled','refunded'));

-- ── exhibitor_rewards (referral cash-back toward booth bookings) ─────────────
-- Each exhibitor gets a unique referral code; when fans buy tickets via their
-- share link, the exhibitor earns a % of the sale as rewards toward a future
-- booth booking.
CREATE TABLE IF NOT EXISTS exhibitor_rewards (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code           TEXT UNIQUE NOT NULL,
  name           TEXT,
  email          CITEXT UNIQUE NOT NULL,
  balance_cents  INTEGER NOT NULL DEFAULT 0,   -- available to redeem
  earned_cents   INTEGER NOT NULL DEFAULT 0,   -- lifetime earned
  redeemed_cents INTEGER NOT NULL DEFAULT 0,   -- lifetime redeemed
  is_active      BOOLEAN NOT NULL DEFAULT TRUE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
DROP TRIGGER IF EXISTS trg_exhibitor_rewards_updated ON exhibitor_rewards;
CREATE TRIGGER trg_exhibitor_rewards_updated BEFORE UPDATE ON exhibitor_rewards
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Ledger of reward movements (earn from referrals, manual adjust, redeem).
CREATE TABLE IF NOT EXISTS reward_events (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reward_id   UUID NOT NULL REFERENCES exhibitor_rewards(id) ON DELETE CASCADE,
  type        TEXT NOT NULL CHECK (type IN ('earn','redeem','adjust')),
  order_id    UUID REFERENCES orders(id),
  sale_cents  INTEGER NOT NULL DEFAULT 0,
  amount_cents INTEGER NOT NULL,             -- signed: +earn/+adjust, -redeem
  note        TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_reward_events_reward ON reward_events(reward_id);

-- Referral attribution on orders (which exhibitor's link drove this sale).
ALTER TABLE orders ADD COLUMN IF NOT EXISTS referral_code TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS reward_credited BOOLEAN NOT NULL DEFAULT FALSE;

-- ── past_exhibitors (directory of prior-year exhibitors) ────────────────────
-- Populated after each show; powers the Past Exhibitors directory page.
CREATE TABLE IF NOT EXISTS past_exhibitors (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company     TEXT NOT NULL,
  stand       TEXT,
  category    TEXT,            -- e.g. Retailer, Artist Alley, Corporate
  year        INTEGER,
  website     TEXT,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_past_exhibitors_company ON past_exhibitors(company);
