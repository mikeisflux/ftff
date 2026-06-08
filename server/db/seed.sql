-- ─────────────────────────────────────────────────────────────────────────────
-- Convention Platform — seed (idempotent). Run after schema.sql.
-- Seeds: theme, show_info, settings catalog (§5), five ticket types (§8),
-- default mega-menu (§7.0), footer pages, a couple FAQs.
-- The first admin user is created by `npm run db:seed:admin` (interactive),
-- NOT here, so no password ends up in source control.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── theme (single row) ───────────────────────────────────────────────────────
INSERT INTO theme (id, tokens, glow_color, glow_intensity, font_display, font_body, radius, default_mode, allow_user_toggle)
VALUES (
  1,
  jsonb_build_object(
    'dark', jsonb_build_object(
      'primary',   '#7c3aed',
      'secondary', '#06b6d4',
      'accent',    '#ec4899',
      'background', '#070711',
      'surface',   '#0f0f1f',
      'text',      '#f5f3ff',
      'muted',     '#9aa0b4',
      'success',   '#22c55e',
      'danger',    '#ef4444'
    ),
    'light', jsonb_build_object(
      'primary',   '#6d28d9',
      'secondary', '#0891b2',
      'accent',    '#db2777',
      'background', '#f7f7fb',
      'surface',   '#ffffff',
      'text',      '#11121a',
      'muted',     '#5b6072',
      'success',   '#16a34a',
      'danger',    '#dc2626'
    )
  ),
  '#7c3aed', 65, 'Orbitron', 'Inter', '12px', 'dark', TRUE
)
ON CONFLICT (id) DO NOTHING;

-- ── show_info (single row) ───────────────────────────────────────────────────
INSERT INTO show_info (id, name, tagline, starts_on, ends_on, venue, address, lat, lng, hours_json)
VALUES (
  1,
  'FAN EXPO Chicago',
  'The ultimate fan experience.',
  '2026-08-21', '2026-08-23',
  'Donald E. Stephens Convention Center',
  '5555 N River Rd, Rosemont, IL 60018',
  41.9803, -87.8612,
  '[{"day":"Friday","open":"16:00","close":"21:00"},{"day":"Saturday","open":"10:00","close":"19:00"},{"day":"Sunday","open":"10:00","close":"17:00"}]'::jsonb
)
ON CONFLICT (id) DO NOTHING;

-- ── settings catalog (§5) — definitions only, no secret values ───────────────
INSERT INTO settings (key, category, label, description, is_secret) VALUES
  ('stripe.publishable_key',         'Payments',      'Stripe Publishable Key',     'pk_live/pk_test — safe for the browser.', FALSE),
  ('stripe.secret_key',              'Payments',      'Stripe Secret Key',          'sk_live/sk_test — server only.', TRUE),
  ('stripe.webhook_secret',          'Payments',      'Stripe Webhook Secret',      'whsec_… for signature verification.', TRUE),
  ('stripe.currency',                'Payments',      'Currency',                   'ISO currency code, e.g. usd.', FALSE),

  ('sendgrid.api_key',               'Email',         'SendGrid API Key',           'Outbound transactional + marketing.', TRUE),
  ('sendgrid.from_address',          'Email',         'From Address',               'Verified sender address.', FALSE),
  ('sendgrid.from_name',             'Email',         'From Name',                  'Display name on outbound mail.', FALSE),
  ('sendgrid.inbound_domain',        'Email',         'Inbound Parse Domain',       'Subdomain pointed at SendGrid MX.', FALSE),
  ('sendgrid.inbound_webhook_secret','Email',         'Inbound Webhook Secret',     'Shared secret to verify inbound posts.', TRUE),

  ('cloudflare.account_id',          'Video',         'Cloudflare Account ID',      NULL, FALSE),
  ('cloudflare.stream_api_token',    'Video',         'Stream API Token',           'Cloudflare Stream API token.', TRUE),
  ('cloudflare.live_input_id',       'Video',         'Live Input ID',              'RTMP ingest live input.', FALSE),
  ('cloudflare.customer_subdomain',  'Video',         'Customer Subdomain',         'e.g. customer-xxxx.cloudflarestream.com', FALSE),

  ('maps.google_api_key',            'Integrations',  'Google Maps API Key',        'For the embedded venue map.', TRUE),
  ('recaptcha.site_key',             'Integrations',  'reCAPTCHA Site Key',         'Public site key.', FALSE),
  ('recaptcha.secret',               'Integrations',  'reCAPTCHA Secret',           'Server-side verification secret.', TRUE),

  ('site.name',                      'Site & Branding','Site Name',                 NULL, FALSE),
  ('site.logo_url',                  'Site & Branding','Logo URL',                  'Header logo (also see Theme & Branding).', FALSE),

  ('social.share_url',               'Social',        'Canonical Share URL',        'Canonical URL used by the share button.', FALSE),
  ('social.default_og_image_url',    'Social',        'Default OG Image',           '≥1200×630 fallback share image.', FALSE),
  ('social.x_handle',                'Social',        'X / Twitter Handle',         'e.g. @fanexpo', FALSE),
  ('social.facebook_app_id',         'Social',        'Facebook App ID',            'fb:app_id meta tag.', FALSE),
  ('social.facebook_url',            'Social',        'Facebook URL',               NULL, FALSE),
  ('social.instagram_url',           'Social',        'Instagram URL',              NULL, FALSE),

  ('vendor.floorplan_url',           'Vendors',       'Floor Plan Image URL',       'Uploaded floor-plan image.', FALSE),
  ('vendor.hold_minutes',            'Vendors',       'Booth Hold Minutes',         'Soft-hold duration during checkout.', FALSE)
ON CONFLICT (key) DO NOTHING;

-- sensible non-secret defaults
UPDATE settings SET value = 'usd', is_set = TRUE WHERE key = 'stripe.currency' AND NOT is_set;
UPDATE settings SET value = '15',  is_set = TRUE WHERE key = 'vendor.hold_minutes' AND NOT is_set;
UPDATE settings SET value = 'FAN EXPO Chicago', is_set = TRUE WHERE key = 'site.name' AND NOT is_set;

-- ── ticket_types (five fixed, §8) ────────────────────────────────────────────
-- Pricing: single-day $40, 3-day (multi-day) $80, digital $10. Upsert so
-- re-seeding refreshes prices/copy.
INSERT INTO ticket_types (code, name, description, price_cents, is_digital, sort_order) VALUES
  ('friday',    'Friday',  'Single-day admission for Friday.',   4000, FALSE, 1),
  ('saturday',  'Saturday','Single-day admission for Saturday.', 4000, FALSE, 2),
  ('sunday',    'Sunday',  'Single-day admission for Sunday.',   4000, FALSE, 3),
  ('three_day', '3-Day',   'All three days. Best value.',        8000, FALSE, 4),
  ('digital',   'Digital', 'Virtual Con Experience livestream access.', 1000, TRUE, 5)
ON CONFLICT (code) DO UPDATE
  SET name = EXCLUDED.name, description = EXCLUDED.description,
      price_cents = EXCLUDED.price_cents, is_digital = EXCLUDED.is_digital,
      sort_order = EXCLUDED.sort_order;

-- ── default mega-menu (§7.0) ─────────────────────────────────────────────────
DO $$
DECLARE
  shop_id     UUID;
  guests_id   UUID;
  attr_id     UUID;
  plan_id     UUID;
  apply_id    UUID;
  exh_id      UUID;
BEGIN
  IF EXISTS (SELECT 1 FROM nav_menu LIMIT 1) THEN
    RETURN; -- already seeded
  END IF;

  -- top-level (route is required when no children, but parents need a target too;
  -- give each parent a landing route)
  INSERT INTO nav_menu (label, route, sort_order, is_cta) VALUES ('Shop', '/shop', 1, FALSE) RETURNING id INTO shop_id;
  INSERT INTO nav_menu (label, route, sort_order) VALUES ('Guests', '/all-guests', 2) RETURNING id INTO guests_id;
  INSERT INTO nav_menu (label, route, sort_order) VALUES ('Attractions', '/main-events', 3) RETURNING id INTO attr_id;
  INSERT INTO nav_menu (label, route, sort_order) VALUES ('Plan Your Visit', '/getting-here', 4) RETURNING id INTO plan_id;
  INSERT INTO nav_menu (label, route, sort_order) VALUES ('Apply', '/crew', 5) RETURNING id INTO apply_id;
  INSERT INTO nav_menu (label, route, sort_order) VALUES ('Exhibitors', '/become-an-exhibitor', 6) RETURNING id INTO exh_id;
  INSERT INTO nav_menu (label, route, sort_order) VALUES ('About Us', '/about-us', 7);

  -- Shop children
  INSERT INTO nav_menu (parent_id, label, route, sort_order, is_cta) VALUES
    (shop_id, 'Buy Tickets', '/buy-tickets', 1, TRUE),
    (shop_id, 'Special Experiences', '/special-experiences', 2, FALSE),
    (shop_id, 'Photo Ops', '/photo-ops', 3, FALSE),
    (shop_id, 'Autographs', '/autographs', 4, FALSE),
    (shop_id, 'Discounts & Coupons', '/discounts-coupons', 5, FALSE),
    (shop_id, 'Shop', '/shop', 6, FALSE);

  -- Guests children
  INSERT INTO nav_menu (parent_id, label, route, sort_order) VALUES
    (guests_id, 'All Guests', '/all-guests', 1),
    (guests_id, 'Celebrities', '/celebrities', 2),
    (guests_id, 'Animation Voices', '/animation-voices', 3),
    (guests_id, 'Anime Guests', '/anime-guests', 4),
    (guests_id, 'Gaming Stars', '/gaming-stars', 5),
    (guests_id, 'Comic Creators', '/comic-creators', 6),
    (guests_id, 'Cosplayers', '/cosplayers', 7),
    (guests_id, 'Suggest a Guest', '/suggest-a-guest', 8);

  -- Attractions children
  INSERT INTO nav_menu (parent_id, label, route, sort_order) VALUES
    (attr_id, 'Main Events', '/main-events', 1),
    (attr_id, 'Comics', '/comics', 2),
    (attr_id, 'Cosplay', '/cosplay', 3),
    (attr_id, 'Gaming', '/gaming', 4),
    (attr_id, 'Family', '/family', 5),
    (attr_id, 'Community Zone', '/community-zone', 6),
    (attr_id, 'Horror', '/horror', 7),
    (attr_id, 'After Hours Events', '/after-hours-events', 8);

  -- Plan Your Visit children
  INSERT INTO nav_menu (parent_id, label, route, sort_order) VALUES
    (plan_id, 'Getting Here', '/getting-here', 1),
    (plan_id, 'Schedule', '/schedule', 2),
    (plan_id, 'Travel & Hotels', '/travel-hotels', 3),
    (plan_id, 'Floor Plan', '/floor-plan', 4),
    (plan_id, 'Accessibility', '/accessibility', 5),
    (plan_id, 'Show Guides', '/show-guides', 6);

  -- Apply children
  INSERT INTO nav_menu (parent_id, label, route, sort_order) VALUES
    (apply_id, 'Crew', '/crew', 1),
    (apply_id, 'Professional Creators', '/professional-creators', 2),
    (apply_id, 'Cosplay Guest', '/cosplay-guest', 3),
    (apply_id, 'Panel Submission', '/panel-submission', 4),
    (apply_id, 'Media Inquiries', '/media-inquiries', 5),
    (apply_id, 'Want to Exhibit?', '/become-an-exhibitor', 6),
    (apply_id, 'Community', '/community', 7);

  -- Exhibitors children
  INSERT INTO nav_menu (parent_id, label, route, sort_order) VALUES
    (exh_id, 'Become an Exhibitor', '/become-an-exhibitor', 1),
    (exh_id, 'Retailers', '/retailers', 2),
    (exh_id, 'Artist Alley', '/artist-alley', 3),
    (exh_id, 'Corporate', '/corporate', 4),
    (exh_id, 'Advertise', '/advertise', 5),
    (exh_id, 'Exhibitor Rewards', '/exhibitor-rewards', 6),
    (exh_id, 'Social Media Tool Kit', '/social-media-tool-kit', 7),
    (exh_id, 'Past Exhibitors', '/past-exhibitors', 8);
END $$;

-- ── footer / CMS pages (§7.2) — seeded with real default content ─────────────
-- Upsert so re-seeding refreshes the default copy. Admins edit these in the
-- block-based Page Builder; the JSON blocks here are the source of truth.
INSERT INTO pages (slug, title, blocks, body_html, seo_title, seo_description, is_published, published_at) VALUES
  ('about-us', 'About Us',
   '[{"type":"heading","data":{"text":"About FAN EXPO Chicago"}},{"type":"richtext","data":{"html":"<p>FAN EXPO Chicago is the city''s premier celebration of comics, sci-fi, horror, anime, and gaming. Each year fans gather to meet celebrity guests, discover artists and exhibitors, attend panels, and experience the best of pop culture under one roof.</p><p>The event is produced by FAN EXPO HQ, the largest producer of comic conventions in North America.</p>"}}]'::jsonb,
   '<h2>About FAN EXPO Chicago</h2><p>FAN EXPO Chicago is the city''s premier celebration of comics, sci-fi, horror, anime, and gaming. Each year fans gather to meet celebrity guests, discover artists and exhibitors, attend panels, and experience the best of pop culture under one roof.</p><p>The event is produced by FAN EXPO HQ, the largest producer of comic conventions in North America.</p>',
   'About Us | FAN EXPO Chicago', 'Learn about FAN EXPO Chicago, the city''s premier pop-culture convention.', TRUE, now()),

  ('policies', 'Policies',
   '[{"type":"heading","data":{"text":"Policies"}},{"type":"richtext","data":{"html":"<p>By attending FAN EXPO Chicago you agree to the following policies.</p><h3>Tickets &amp; Refunds</h3><p>All ticket sales are final and non-refundable unless the event is cancelled. Tickets are non-transferable once checked in.</p><h3>Code of Conduct</h3><p>Harassment of any kind is not tolerated. Follow the instructions of show staff and security at all times.</p><h3>Bag &amp; Prop Policy</h3><p>All bags and props are subject to inspection. Functional weapons and realistic firearms are prohibited.</p>"}}]'::jsonb,
   '<h2>Policies</h2><p>By attending FAN EXPO Chicago you agree to the following policies.</p><h3>Tickets &amp; Refunds</h3><p>All ticket sales are final and non-refundable unless the event is cancelled. Tickets are non-transferable once checked in.</p><h3>Code of Conduct</h3><p>Harassment of any kind is not tolerated. Follow the instructions of show staff and security at all times.</p><h3>Bag &amp; Prop Policy</h3><p>All bags and props are subject to inspection. Functional weapons and realistic firearms are prohibited.</p>',
   'Policies | FAN EXPO Chicago', 'Ticket, refund, conduct, and prop policies for FAN EXPO Chicago.', TRUE, now()),

  ('accessibility', 'Accessibility',
   '[{"type":"heading","data":{"text":"Accessibility"}},{"type":"richtext","data":{"html":"<p>FAN EXPO Chicago is committed to a welcoming, accessible experience for every attendee.</p><ul><li>The venue is wheelchair accessible, including ramps and elevators.</li><li>Accessible restrooms are available on every level.</li><li>ASL interpretation is available for main-stage panels on request.</li><li>A quiet sensory room is available during show hours.</li></ul><p>For specific accommodation requests, contact us before the show.</p>"}}]'::jsonb,
   '<h2>Accessibility</h2><p>FAN EXPO Chicago is committed to a welcoming, accessible experience for every attendee.</p><ul><li>The venue is wheelchair accessible, including ramps and elevators.</li><li>Accessible restrooms are available on every level.</li><li>ASL interpretation is available for main-stage panels on request.</li><li>A quiet sensory room is available during show hours.</li></ul><p>For specific accommodation requests, contact us before the show.</p>',
   'Accessibility | FAN EXPO Chicago', 'Accessibility services and accommodations at FAN EXPO Chicago.', TRUE, now())
ON CONFLICT (slug) DO UPDATE
  SET title = EXCLUDED.title, blocks = EXCLUDED.blocks, body_html = EXCLUDED.body_html,
      seo_title = EXCLUDED.seo_title, seo_description = EXCLUDED.seo_description,
      is_published = TRUE, published_at = COALESCE(pages.published_at, now());

-- ── booths (default vendor floor inventory; admin replaces via the editor) ───
INSERT INTO booths (label, zone, price_cents, pos_x, pos_y, width, height) VALUES
  ('A1', 'Artist Alley',  35000, 0.06, 0.10, 0.16, 0.16),
  ('A2', 'Artist Alley',  35000, 0.26, 0.10, 0.16, 0.16),
  ('A3', 'Artist Alley',  35000, 0.46, 0.10, 0.16, 0.16),
  ('B1', 'Exhibitor Hall',75000, 0.06, 0.40, 0.22, 0.22),
  ('B2', 'Exhibitor Hall',75000, 0.34, 0.40, 0.22, 0.22),
  ('C1', 'Premium',      120000, 0.66, 0.40, 0.26, 0.30)
ON CONFLICT DO NOTHING;

-- ── FAQs ─────────────────────────────────────────────────────────────────────
INSERT INTO faqs (question, answer, sort_order) VALUES
  ('Where is the convention held?', 'At the Donald E. Stephens Convention Center in Rosemont, IL.', 1),
  ('Are tickets refundable?', 'All sales are final unless the event is cancelled.', 2)
ON CONFLICT DO NOTHING;
