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
      'secondary', '#2dd4bf',
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
      'secondary', '#0d9488',
      'accent',    '#db2777',
      'background', '#f7f7fb',
      'surface',   '#ffffff',
      'text',      '#11121a',
      'muted',     '#5b6072',
      'success',   '#16a34a',
      'danger',    '#dc2626'
    )
  ),
  '#2dd4bf', 65, 'Roboto', 'Roboto', '12px', 'dark', TRUE
)
ON CONFLICT (id) DO NOTHING;

-- Brand assets (header logo + favicon). COALESCE keeps any admin-set values,
-- but fills them in on re-seed when still empty.
UPDATE theme SET
  logo_url      = COALESCE(logo_url,      '/ftfflogo.png'),
  logo_dark_url = COALESCE(logo_dark_url, '/ftfflogo.png'),
  logo_light_url= COALESCE(logo_light_url,'/ftfflogo.png'),
  favicon_url   = COALESCE(favicon_url,   '/favicon.ico')
WHERE id = 1;

-- ── show_info (single row) ───────────────────────────────────────────────────
INSERT INTO show_info (id, name, tagline, starts_on, ends_on, venue, address, lat, lng, hours_json)
VALUES (
  1,
  'For The Fans Fest',
  'The ultimate fan experience.',
  '2026-10-16', '2026-10-18',
  'Harrah''s Resort Atlantic City',
  '777 Harrah''s Blvd, Atlantic City, NJ 08401',
  39.3793, -74.4366,
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
  ('social.x_handle',                'Social',        'X / Twitter Handle',         'e.g. @forfansfest', FALSE),
  ('social.facebook_app_id',         'Social',        'Facebook App ID',            'fb:app_id meta tag.', FALSE),
  ('social.facebook_url',            'Social',        'Facebook URL',               NULL, FALSE),
  ('social.instagram_url',           'Social',        'Instagram URL',              NULL, FALSE),

  ('vendor.floorplan_url',           'Vendors',       'Floor Plan Image URL',       'Uploaded floor-plan image.', FALSE),
  ('vendor.hold_minutes',            'Vendors',       'Booth Hold Minutes',         'Soft-hold duration during checkout.', FALSE),

  ('virtual.chat_enabled',           'Video',         'Live Chat Enabled',          'Show live chat on the Virtual Con page.', FALSE),
  ('privacy.consent_banner_enabled', 'Privacy',       'Cookie Consent Banner',      'Show the EU/US cookie & privacy consent banner. Set to false to hide it.', FALSE),

  ('shipping.domestic_cents',        'Shipping',      'United States (cents)',       'Flat per-order shipping fee to the US.', FALSE),
  ('shipping.canada_cents',          'Shipping',      'Canada (cents)',             'Flat per-order shipping fee to Canada.', FALSE),
  ('shipping.uk_cents',              'Shipping',      'United Kingdom (cents)',     'Flat per-order shipping fee to the UK.', FALSE),
  ('shipping.world_cents',           'Shipping',      'Rest of World (cents)',      'Flat per-order shipping fee everywhere else.', FALSE)
ON CONFLICT (key) DO NOTHING;

-- sensible non-secret defaults
UPDATE settings SET value = 'usd', is_set = TRUE WHERE key = 'stripe.currency' AND NOT is_set;
UPDATE settings SET value = '15',  is_set = TRUE WHERE key = 'vendor.hold_minutes' AND NOT is_set;
UPDATE settings SET value = 'For The Fans Fest', is_set = TRUE WHERE key = 'site.name' AND NOT is_set;
UPDATE settings SET value = '/og-default.png', is_set = TRUE WHERE key = 'social.default_og_image_url' AND NOT is_set;
UPDATE settings SET value = 'true', is_set = TRUE WHERE key = 'virtual.chat_enabled' AND NOT is_set;
UPDATE settings SET value = 'true', is_set = TRUE WHERE key = 'privacy.consent_banner_enabled' AND NOT is_set;
UPDATE settings SET value = '1300', is_set = TRUE WHERE key = 'shipping.domestic_cents' AND NOT is_set;
UPDATE settings SET value = '2600', is_set = TRUE WHERE key = 'shipping.canada_cents'   AND NOT is_set;
UPDATE settings SET value = '4000', is_set = TRUE WHERE key = 'shipping.uk_cents'        AND NOT is_set;
UPDATE settings SET value = '5000', is_set = TRUE WHERE key = 'shipping.world_cents'     AND NOT is_set;

-- ── ticket_types (five fixed, §8) ────────────────────────────────────────────
-- Pricing: single-day $40, 3-day (multi-day) $80, digital $10. Upsert so
-- re-seeding refreshes prices/copy.
INSERT INTO ticket_types (code, name, description, price_cents, is_digital, sort_order, image_url) VALUES
  ('friday',    'Friday',  'Single-day admission for Friday.',   4000, FALSE, 1, '/tickets/friday.png'),
  ('saturday',  'Saturday','Single-day admission for Saturday.', 4000, FALSE, 2, '/tickets/saturday.png'),
  ('sunday',    'Sunday',  'Single-day admission for Sunday.',   4000, FALSE, 3, '/tickets/sunday.png'),
  ('three_day', '2-Day',   'Any two days. Great value.',         8000, FALSE, 4, '/tickets/two_day.png'),
  ('digital',   'Digital', 'Virtual Con livestream access — login with your confirmation number.', 1000, TRUE, 5, '/tickets/digital.png')
ON CONFLICT (code) DO UPDATE
  -- Re-seed refreshes copy + tile image but NEVER overwrites admin-set prices.
  SET image_url = COALESCE(ticket_types.image_url, EXCLUDED.image_url);

-- Repoint the multi-day pass from the old "3-Day" tile to the "2-Day" tile on
-- DBs seeded before this change. Guarded to the old default so an admin-set
-- custom image is preserved; idempotent on re-run.
UPDATE ticket_types
   SET image_url   = '/tickets/two_day.png',
       name        = '2-Day',
       description = 'Any two days. Great value.'
 WHERE code = 'three_day'
   AND image_url = '/tickets/three_day.png';

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
  INSERT INTO nav_menu (label, route, sort_order, is_cta) VALUES ('LIVE!', '/virtual', 8, TRUE);

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
    (guests_id, 'Comic Creators', '/comic-creators', 3),
    (guests_id, 'Cosplayers', '/cosplayers', 4),
    (guests_id, 'Suggest a Guest', '/suggest-a-guest', 5);

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

-- Reconcile the Shop + Attractions submenus to the requested items, and add the
-- top-level Vendors item. Runs on every seed (the mega-menu block above only
-- runs once) so the live nav matches. Shop/Attractions children are treated as
-- seed-owned; admins manage other menus in the Navigation builder.
DO $$
DECLARE
  shop_id UUID;
  attr_id UUID;
BEGIN
  SELECT id INTO shop_id FROM nav_menu WHERE parent_id IS NULL AND label = 'Shop' LIMIT 1;
  SELECT id INTO attr_id FROM nav_menu WHERE parent_id IS NULL AND label = 'Attractions' LIMIT 1;

  IF shop_id IS NOT NULL THEN
    DELETE FROM nav_menu WHERE parent_id = shop_id;
    INSERT INTO nav_menu (parent_id, label, route, sort_order, is_cta) VALUES
      (shop_id, 'Buy Tickets', '/buy-tickets', 1, TRUE),
      (shop_id, 'Room Rate Guarantee', '/room-rate-guarantee', 2, FALSE),
      (shop_id, 'Sponsorships', '/sponsorships', 3, FALSE),
      (shop_id, 'Discounts and Coupons', '/discounts-coupons', 4, FALSE),
      (shop_id, 'Shop', '/shop', 5, FALSE);
  END IF;

  IF attr_id IS NOT NULL THEN
    DELETE FROM nav_menu WHERE parent_id = attr_id;
    INSERT INTO nav_menu (parent_id, label, route, sort_order) VALUES
      (attr_id, 'Warlock Awards Banquet', '/warlock-awards-banquet', 1),
      (attr_id, 'Graham Nolan''s Cigar Fest', '/graham-nolans-cigar-fest', 2),
      (attr_id, 'Live Stream Panels', '/live-stream-panels', 3),
      (attr_id, 'Gaming', '/gaming', 4);
  END IF;

  -- Top-level Vendors (inserted once, just before About Us).
  IF NOT EXISTS (SELECT 1 FROM nav_menu WHERE parent_id IS NULL AND label = 'Vendors') THEN
    UPDATE nav_menu SET sort_order = sort_order + 1 WHERE parent_id IS NULL AND sort_order >= 7;
    INSERT INTO nav_menu (label, route, sort_order) VALUES ('Vendors', '/vendors', 7);
  END IF;
END $$;

-- ── footer / CMS pages (§7.2) — seeded with real default content ─────────────
-- Upsert so re-seeding refreshes the default copy. Admins edit these in the
-- block-based Page Builder; the JSON blocks here are the source of truth.
INSERT INTO pages (slug, title, blocks, body_html, seo_title, seo_description, is_published, published_at) VALUES
  ('about-us', 'About Us',
   '[{"type":"heading","data":{"text":"About For The Fans Fest"}},{"type":"richtext","data":{"html":"<p>For more than a decade, the independent comic scene has exploded across social media, building an incredible online community of untapped, unshackled creativity. For The Fans Fest exists to bring that cultural movement off the screen and directly to the fans.</p><p>Each October we take over Harrah&rsquo;s Resort &amp; Casino in the heart of Atlantic City, New Jersey for a weekend-long celebration of indie comics and collectibles. Our 2026 show runs October 16&ndash;18 and features the very first Warlock Comic Awards Banquet, two full days of live streams and panels with the very best in the indie comic book scene, and an exclusive comic and toy convention floor open to all fans.</p><p>Come party and celebrate with some of the best professionals in the business &mdash; Ethan Van Sciver, Chuck Dixon, Billy Tucci, Graham Nolan, Jon Malin, Shane Davis, Mandy Summers, Shanth Enjeti, Andy Smith, Mike Baron, Vasilis Lolos, and many, many more to be announced.</p><p>See you there!</p>"}}]'::jsonb,
   '<h2>About For The Fans Fest</h2><p>For more than a decade, the independent comic scene has exploded across social media, building an incredible online community of untapped, unshackled creativity. For The Fans Fest exists to bring that cultural movement off the screen and directly to the fans.</p><p>Each October we take over Harrah&rsquo;s Resort &amp; Casino in the heart of Atlantic City, New Jersey for a weekend-long celebration of indie comics and collectibles. Our 2026 show runs October 16&ndash;18 and features the very first Warlock Comic Awards Banquet, two full days of live streams and panels with the very best in the indie comic book scene, and an exclusive comic and toy convention floor open to all fans.</p><p>Come party and celebrate with some of the best professionals in the business &mdash; Ethan Van Sciver, Chuck Dixon, Billy Tucci, Graham Nolan, Jon Malin, Shane Davis, Mandy Summers, Shanth Enjeti, Andy Smith, Mike Baron, Vasilis Lolos, and many, many more to be announced.</p><p>See you there!</p>',
   'About Us | For The Fans Fest', 'Independent comics, collectibles, and the Warlock Comic Awards — For The Fans Fest, Oct 16–18, 2026 in Atlantic City.', TRUE, now()),

  ('policies', 'Policies',
   '[{"type":"heading","data":{"text":"Policies"}},{"type":"richtext","data":{"html":"<p>By attending For The Fans Fest you agree to the following policies.</p><h3>Tickets &amp; Refunds</h3><p>All ticket sales are final and non-refundable unless the event is cancelled. Tickets are non-transferable once checked in.</p><h3>Code of Conduct</h3><p>Harassment of any kind is not tolerated. Follow the instructions of show staff and security at all times.</p><h3>Bag &amp; Prop Policy</h3><p>All bags and props are subject to inspection. Functional weapons and realistic firearms are prohibited.</p>"}}]'::jsonb,
   '<h2>Policies</h2><p>By attending For The Fans Fest you agree to the following policies.</p><h3>Tickets &amp; Refunds</h3><p>All ticket sales are final and non-refundable unless the event is cancelled. Tickets are non-transferable once checked in.</p><h3>Code of Conduct</h3><p>Harassment of any kind is not tolerated. Follow the instructions of show staff and security at all times.</p><h3>Bag &amp; Prop Policy</h3><p>All bags and props are subject to inspection. Functional weapons and realistic firearms are prohibited.</p>',
   'Policies | For The Fans Fest', 'Ticket, refund, conduct, and prop policies for For The Fans Fest.', TRUE, now()),

  ('accessibility', 'Accessibility',
   '[{"type":"heading","data":{"text":"Accessibility"}},{"type":"richtext","data":{"html":"<p>For The Fans Fest is committed to a welcoming, accessible experience for every attendee.</p><ul><li>The venue is wheelchair accessible, including ramps and elevators.</li><li>Accessible restrooms are available on every level.</li><li>ASL interpretation is available for main-stage panels on request.</li><li>A quiet sensory room is available during show hours.</li></ul><p>For specific accommodation requests, contact us before the show.</p>"}}]'::jsonb,
   '<h2>Accessibility</h2><p>For The Fans Fest is committed to a welcoming, accessible experience for every attendee.</p><ul><li>The venue is wheelchair accessible, including ramps and elevators.</li><li>Accessible restrooms are available on every level.</li><li>ASL interpretation is available for main-stage panels on request.</li><li>A quiet sensory room is available during show hours.</li></ul><p>For specific accommodation requests, contact us before the show.</p>',
   'Accessibility | For The Fans Fest', 'Accessibility services and accommodations at For The Fans Fest.', TRUE, now())
ON CONFLICT (slug) DO NOTHING;

-- ── legal / compliance pages (Privacy, Terms, Refunds, Cookies, Exhibitor) ──
-- Drafts generated from site facts; have counsel review and fill the
-- [bracketed] contact/entity placeholders before relying on them.
INSERT INTO pages (slug, title, blocks, body_html, seo_title, seo_description, is_published, published_at) VALUES
  ('privacy-policy', 'Privacy Policy',
   '[{"type": "heading", "data": {"text": "Privacy Policy"}}, {"type": "richtext", "data": {"html": "<p><em>Last updated: June 10, 2026.</em></p><p>This Privacy Policy explains how For The Fans Fest (&ldquo;we,&rdquo; &ldquo;us,&rdquo; or &ldquo;our&rdquo;) collects, uses, and shares information when you visit our website, buy tickets or merchandise, reserve an exhibitor booth, or attend our event. By using the site you agree to this policy.</p><h3>Information we collect</h3><ul><li><strong>Contact &amp; order details</strong> you provide at checkout: name, email address, phone number, and — for shipped merchandise — a postal shipping address (United States and Canada).</li><li><strong>Exhibitor / vendor details</strong> when you reserve a booth: business name, contact information, and the booth selected.</li><li><strong>Messages</strong> you send through our contact, media, exhibitor, or support forms, and any inbound email you send us.</li><li><strong>Technical data</strong> automatically collected for security and reliability, such as IP address, device/browser type, and pages viewed.</li></ul><p>We do <strong>not</strong> collect or store your full payment-card number. Card payments are processed entirely by Stripe on Stripe-hosted pages; we receive only a confirmation and a transaction reference.</p><h3>How we use your information</h3><ul><li>To process and fulfil ticket, merchandise, and booth orders and send order confirmations and event communications.</li><li>To provide customer support and respond to your inquiries.</li><li>To send marketing or newsletter email <em>where you have opted in</em>; every marketing message includes an unsubscribe link.</li><li>To operate, secure, and improve the site, and to prevent fraud and abuse.</li><li>To comply with legal obligations.</li></ul><h3>Service providers we share data with</h3><p>We share information only with vendors who help us run the event, each acting under contract:</p><ul><li><strong>Stripe</strong> &mdash; payment processing.</li><li><strong>SendGrid (Twilio)</strong> &mdash; transactional and marketing email.</li><li><strong>Cloudflare</strong> &mdash; content delivery and video streaming for the Virtual Con.</li><li><strong>Google</strong> &mdash; embedded Maps and reCAPTCHA anti-abuse.</li></ul><p>We do not sell your personal information. We may disclose information if required by law or to protect our rights and the safety of attendees.</p><h3>Cookies</h3><p>We and our providers use cookies and similar technologies. See our <a href=\"/cookie-policy\">Cookie Notice</a> for details and choices.</p><h3>Data retention</h3><p>We keep order and contact records for as long as needed to fulfil your order, run the event, and meet tax, accounting, and legal requirements, then delete or anonymize them.</p><h3>Your rights</h3><p>Depending on where you live (including under the California Consumer Privacy Act / CPRA), you may have the right to access, correct, delete, or restrict use of your personal information, and to opt out of marketing. To make a request, contact us at [privacy@forthefansfest.com]. We will not discriminate against you for exercising these rights.</p><h3>Children</h3><p>The site is not directed to children under 13, and we do not knowingly collect their personal information.</p><h3>Security</h3><p>We use administrative and technical safeguards to protect your information, including encryption of sensitive settings and restricted administrative access. No method of transmission is perfectly secure.</p><h3>Changes</h3><p>We may update this policy and will revise the date above when we do.</p><h3>Contact</h3><p>For The Fans Fest &mdash; [privacy@forthefansfest.com]. Mailing address: 777 Harrah''s Blvd, Atlantic City, NJ 08401.</p>"}}]'::jsonb,
   '<h2>Privacy Policy</h2><p><em>Last updated: June 10, 2026.</em></p><p>This Privacy Policy explains how For The Fans Fest (&ldquo;we,&rdquo; &ldquo;us,&rdquo; or &ldquo;our&rdquo;) collects, uses, and shares information when you visit our website, buy tickets or merchandise, reserve an exhibitor booth, or attend our event. By using the site you agree to this policy.</p><h3>Information we collect</h3><ul><li><strong>Contact &amp; order details</strong> you provide at checkout: name, email address, phone number, and — for shipped merchandise — a postal shipping address (United States and Canada).</li><li><strong>Exhibitor / vendor details</strong> when you reserve a booth: business name, contact information, and the booth selected.</li><li><strong>Messages</strong> you send through our contact, media, exhibitor, or support forms, and any inbound email you send us.</li><li><strong>Technical data</strong> automatically collected for security and reliability, such as IP address, device/browser type, and pages viewed.</li></ul><p>We do <strong>not</strong> collect or store your full payment-card number. Card payments are processed entirely by Stripe on Stripe-hosted pages; we receive only a confirmation and a transaction reference.</p><h3>How we use your information</h3><ul><li>To process and fulfil ticket, merchandise, and booth orders and send order confirmations and event communications.</li><li>To provide customer support and respond to your inquiries.</li><li>To send marketing or newsletter email <em>where you have opted in</em>; every marketing message includes an unsubscribe link.</li><li>To operate, secure, and improve the site, and to prevent fraud and abuse.</li><li>To comply with legal obligations.</li></ul><h3>Service providers we share data with</h3><p>We share information only with vendors who help us run the event, each acting under contract:</p><ul><li><strong>Stripe</strong> &mdash; payment processing.</li><li><strong>SendGrid (Twilio)</strong> &mdash; transactional and marketing email.</li><li><strong>Cloudflare</strong> &mdash; content delivery and video streaming for the Virtual Con.</li><li><strong>Google</strong> &mdash; embedded Maps and reCAPTCHA anti-abuse.</li></ul><p>We do not sell your personal information. We may disclose information if required by law or to protect our rights and the safety of attendees.</p><h3>Cookies</h3><p>We and our providers use cookies and similar technologies. See our <a href="/cookie-policy">Cookie Notice</a> for details and choices.</p><h3>Data retention</h3><p>We keep order and contact records for as long as needed to fulfil your order, run the event, and meet tax, accounting, and legal requirements, then delete or anonymize them.</p><h3>Your rights</h3><p>Depending on where you live (including under the California Consumer Privacy Act / CPRA), you may have the right to access, correct, delete, or restrict use of your personal information, and to opt out of marketing. To make a request, contact us at [privacy@forthefansfest.com]. We will not discriminate against you for exercising these rights.</p><h3>Children</h3><p>The site is not directed to children under 13, and we do not knowingly collect their personal information.</p><h3>Security</h3><p>We use administrative and technical safeguards to protect your information, including encryption of sensitive settings and restricted administrative access. No method of transmission is perfectly secure.</p><h3>Changes</h3><p>We may update this policy and will revise the date above when we do.</p><h3>Contact</h3><p>For The Fans Fest &mdash; [privacy@forthefansfest.com]. Mailing address: 777 Harrah''s Blvd, Atlantic City, NJ 08401.</p>',
   'Privacy Policy | For The Fans Fest', 'How For The Fans Fest collects, uses, and protects your information.', TRUE, now()),
  ('terms', 'Terms of Sale & Use',
   '[{"type": "heading", "data": {"text": "Terms of Sale & Use"}}, {"type": "richtext", "data": {"html": "<p><em>Last updated: June 10, 2026.</em></p><p>These Terms govern your purchase of tickets, merchandise, and exhibitor booths from For The Fans Fest and your use of our website and event. By purchasing or attending, you agree to these Terms.</p><h3>Eligibility</h3><p>You must be able to form a binding contract to purchase. Minors must be accompanied by a ticketed adult as required by venue rules.</p><h3>Tickets &amp; admission</h3><ul><li>Prices are shown at checkout in U.S. dollars and are charged in full at purchase.</li><li>All ticket sales are <strong>final and non-refundable</strong> unless the event is cancelled. Tickets are <strong>non-transferable once checked in</strong>.</li><li>A ticket is a revocable license to attend. We may refuse entry or remove anyone who violates our policies, venue rules, or the law, without refund.</li><li>Single-day, multi-day, and Digital passes grant only the access described for that pass type.</li></ul><h3>Payment</h3><p>Payments are processed by Stripe on Stripe-hosted pages. We never receive or store your full card details. You authorize the charge shown at checkout.</p><h3>Conduct, bags &amp; props</h3><p>Attendance is subject to our <a href=\"/policies\">Policies</a>, including the code of conduct and the bag &amp; prop policy. Harassment is not tolerated. Bags and props are subject to inspection; functional weapons and realistic firearms are prohibited.</p><h3>Photography &amp; likeness</h3><p>The event may be photographed, filmed, and live-streamed. By attending you grant us a non-exclusive, royalty-free license to use your image and likeness as captured at the event for promotional purposes.</p><h3>Digital / Virtual Con</h3><p>Digital passes provide personal, non-commercial access to the livestream using your confirmation number. Recording, redistribution, or public performance of the stream is prohibited.</p><h3>Intellectual property</h3><p>All site content and event branding is owned by us or our licensors and may not be used without permission.</p><h3>Disclaimers &amp; limitation of liability</h3><p>The site and event are provided on an &ldquo;as is&rdquo; basis. To the fullest extent permitted by law, our total liability arising out of your purchase or attendance is limited to the amount you paid, and we are not liable for indirect or consequential damages. Nothing limits liability that cannot be limited by law.</p><h3>Indemnification</h3><p>You agree to indemnify and hold us harmless from claims arising out of your breach of these Terms or your conduct at the event.</p><h3>Governing law</h3><p>These Terms are governed by the laws of the State of New Jersey, and disputes will be resolved in the state or federal courts located in New Jersey.</p><h3>Changes &amp; contact</h3><p>We may update these Terms and will revise the date above. Questions: [support@forthefansfest.com].</p>"}}]'::jsonb,
   '<h2>Terms of Sale &amp; Use</h2><p><em>Last updated: June 10, 2026.</em></p><p>These Terms govern your purchase of tickets, merchandise, and exhibitor booths from For The Fans Fest and your use of our website and event. By purchasing or attending, you agree to these Terms.</p><h3>Eligibility</h3><p>You must be able to form a binding contract to purchase. Minors must be accompanied by a ticketed adult as required by venue rules.</p><h3>Tickets &amp; admission</h3><ul><li>Prices are shown at checkout in U.S. dollars and are charged in full at purchase.</li><li>All ticket sales are <strong>final and non-refundable</strong> unless the event is cancelled. Tickets are <strong>non-transferable once checked in</strong>.</li><li>A ticket is a revocable license to attend. We may refuse entry or remove anyone who violates our policies, venue rules, or the law, without refund.</li><li>Single-day, multi-day, and Digital passes grant only the access described for that pass type.</li></ul><h3>Payment</h3><p>Payments are processed by Stripe on Stripe-hosted pages. We never receive or store your full card details. You authorize the charge shown at checkout.</p><h3>Conduct, bags &amp; props</h3><p>Attendance is subject to our <a href="/policies">Policies</a>, including the code of conduct and the bag &amp; prop policy. Harassment is not tolerated. Bags and props are subject to inspection; functional weapons and realistic firearms are prohibited.</p><h3>Photography &amp; likeness</h3><p>The event may be photographed, filmed, and live-streamed. By attending you grant us a non-exclusive, royalty-free license to use your image and likeness as captured at the event for promotional purposes.</p><h3>Digital / Virtual Con</h3><p>Digital passes provide personal, non-commercial access to the livestream using your confirmation number. Recording, redistribution, or public performance of the stream is prohibited.</p><h3>Intellectual property</h3><p>All site content and event branding is owned by us or our licensors and may not be used without permission.</p><h3>Disclaimers &amp; limitation of liability</h3><p>The site and event are provided on an &ldquo;as is&rdquo; basis. To the fullest extent permitted by law, our total liability arising out of your purchase or attendance is limited to the amount you paid, and we are not liable for indirect or consequential damages. Nothing limits liability that cannot be limited by law.</p><h3>Indemnification</h3><p>You agree to indemnify and hold us harmless from claims arising out of your breach of these Terms or your conduct at the event.</p><h3>Governing law</h3><p>These Terms are governed by the laws of the State of New Jersey, and disputes will be resolved in the state or federal courts located in New Jersey.</p><h3>Changes &amp; contact</h3><p>We may update these Terms and will revise the date above. Questions: [support@forthefansfest.com].</p>',
   'Terms of Sale & Use | For The Fans Fest', 'The terms governing ticket, merchandise, and booth purchases and event attendance.', TRUE, now()),
  ('refund-policy', 'Refund & Cancellation Policy',
   '[{"type": "heading", "data": {"text": "Refund & Cancellation Policy"}}, {"type": "richtext", "data": {"html": "<p><em>Last updated: June 10, 2026.</em></p><h3>Tickets</h3><p>All ticket sales are <strong>final and non-refundable</strong> unless the event is cancelled. Tickets are <strong>non-transferable once checked in</strong>.</p><h3>Event cancellation or postponement</h3><p>If the event is cancelled, valid ticket holders will receive a refund of the ticket price to the original payment method. If the event is postponed or rescheduled, tickets will be honored for the new date; refund eligibility, if any, will be communicated at that time. We are not responsible for travel, lodging, or other incidental costs.</p><h3>Merchandise</h3><p>Physical merchandise may be returned within 30 days of delivery if unused and in original condition; shipping costs are non-refundable. Contact us to arrange a return.</p><h3>Digital passes</h3><p>Digital / Virtual Con passes are non-refundable once the confirmation number has been issued.</p><h3>Exhibitor booths</h3><p>Booth fees are non-refundable except where required by law or where the event is cancelled by us. See the <a href=\"/exhibitor-terms\">Exhibitor &amp; Booth Sale Terms</a>.</p><h3>How to request a refund</h3><p>Where a refund applies, email [support@forthefansfest.com] with your order number. Approved refunds are issued to the original payment method via Stripe. Please contact us before disputing a charge with your bank so we can resolve it directly.</p>"}}]'::jsonb,
   '<h2>Refund &amp; Cancellation Policy</h2><p><em>Last updated: June 10, 2026.</em></p><h3>Tickets</h3><p>All ticket sales are <strong>final and non-refundable</strong> unless the event is cancelled. Tickets are <strong>non-transferable once checked in</strong>.</p><h3>Event cancellation or postponement</h3><p>If the event is cancelled, valid ticket holders will receive a refund of the ticket price to the original payment method. If the event is postponed or rescheduled, tickets will be honored for the new date; refund eligibility, if any, will be communicated at that time. We are not responsible for travel, lodging, or other incidental costs.</p><h3>Merchandise</h3><p>Physical merchandise may be returned within 30 days of delivery if unused and in original condition; shipping costs are non-refundable. Contact us to arrange a return.</p><h3>Digital passes</h3><p>Digital / Virtual Con passes are non-refundable once the confirmation number has been issued.</p><h3>Exhibitor booths</h3><p>Booth fees are non-refundable except where required by law or where the event is cancelled by us. See the <a href="/exhibitor-terms">Exhibitor &amp; Booth Sale Terms</a>.</p><h3>How to request a refund</h3><p>Where a refund applies, email [support@forthefansfest.com] with your order number. Approved refunds are issued to the original payment method via Stripe. Please contact us before disputing a charge with your bank so we can resolve it directly.</p>',
   'Refund & Cancellation Policy | For The Fans Fest', 'When tickets, merchandise, digital passes, and booths can be refunded.', TRUE, now()),
  ('cookie-policy', 'Cookie Notice',
   '[{"type": "heading", "data": {"text": "Cookie Notice"}}, {"type": "richtext", "data": {"html": "<p><em>Last updated: June 10, 2026.</em></p><p>Cookies are small files stored on your device. We use them to keep the site working and secure and to understand how it is used.</p><h3>Types of cookies we use</h3><ul><li><strong>Essential</strong> &mdash; needed for the cart, checkout, and signed-in admin sessions. The site will not function properly without these.</li><li><strong>Security</strong> &mdash; Google reCAPTCHA helps us block bots and abuse on our forms.</li><li><strong>Embedded content</strong> &mdash; Google Maps (venue map) and Stripe (checkout) may set their own cookies when those features load.</li><li><strong>Functional</strong> &mdash; remember preferences such as light/dark theme.</li></ul><h3>Managing cookies</h3><p>Most browsers let you block or delete cookies in their settings. Blocking essential cookies may break checkout and sign-in. For third-party cookies, see the privacy settings of Google and Stripe.</p><h3>More information</h3><p>See our <a href=\"/privacy-policy\">Privacy Policy</a>. We will revise the date above if this notice changes.</p>"}}]'::jsonb,
   '<h2>Cookie Notice</h2><p><em>Last updated: June 10, 2026.</em></p><p>Cookies are small files stored on your device. We use them to keep the site working and secure and to understand how it is used.</p><h3>Types of cookies we use</h3><ul><li><strong>Essential</strong> &mdash; needed for the cart, checkout, and signed-in admin sessions. The site will not function properly without these.</li><li><strong>Security</strong> &mdash; Google reCAPTCHA helps us block bots and abuse on our forms.</li><li><strong>Embedded content</strong> &mdash; Google Maps (venue map) and Stripe (checkout) may set their own cookies when those features load.</li><li><strong>Functional</strong> &mdash; remember preferences such as light/dark theme.</li></ul><h3>Managing cookies</h3><p>Most browsers let you block or delete cookies in their settings. Blocking essential cookies may break checkout and sign-in. For third-party cookies, see the privacy settings of Google and Stripe.</p><h3>More information</h3><p>See our <a href="/privacy-policy">Privacy Policy</a>. We will revise the date above if this notice changes.</p>',
   'Cookie Notice | For The Fans Fest', 'The cookies For The Fans Fest uses and how to manage them.', TRUE, now()),
  ('exhibitor-terms', 'Exhibitor & Booth Sale Terms',
   '[{"type": "heading", "data": {"text": "Exhibitor & Booth Sale Terms"}}, {"type": "richtext", "data": {"html": "<p><em>Last updated: June 10, 2026.</em></p><p>These terms govern the reservation and purchase of exhibitor booths at For The Fans Fest (the &ldquo;Event&rdquo;). By reserving a booth you (the &ldquo;Exhibitor&rdquo;) agree to these terms in addition to our <a href=\"/terms\">Terms of Sale &amp; Use</a> and <a href=\"/policies\">Policies</a>.</p><h3>Booth selection &amp; holds</h3><p>Booths are selected from the interactive floor plan and priced by zone (for example, Artist Alley and Exhibitor Hall). When you select a booth we place a temporary <strong>hold</strong> on it so another exhibitor cannot buy it while you check out. The hold expires after a short window (15 minutes by default), after which the booth is automatically released and made available again if checkout is not completed.</p><h3>Payment &amp; confirmation</h3><p>Booth fees are payable in full at checkout through Stripe. <strong>A booth is confirmed and marked sold only after payment succeeds.</strong> Selecting a booth or holding it does not reserve it until payment is complete. Prices are shown on the floor plan in U.S. dollars.</p><h3>Fees &amp; refunds</h3><p>Booth fees are <strong>non-refundable</strong> except where the Event is cancelled by us or as required by law. Booth assignments are final.</p><h3>Transfer &amp; subletting</h3><p>Booths may not be transferred, shared, sublet, or resold without our prior written consent. The booth must be used by the Exhibitor named on the order.</p><h3>Setup, staffing &amp; teardown</h3><p>Exhibitors must set up, staff, and tear down their booth during the published show hours and follow all instructions of show staff, security, and the venue.</p><h3>Conduct &amp; prohibited goods</h3><p>Exhibitors must comply with our code of conduct and bag &amp; prop policy. The sale of counterfeit, infringing, illegal, or unsafe goods, and of functional weapons or realistic firearms, is prohibited. We may remove any Exhibitor in violation without refund.</p><h3>Insurance, liability &amp; indemnification</h3><p>Exhibitors are responsible for their own goods, displays, and personnel and are encouraged to carry their own insurance. To the fullest extent permitted by law, we are not liable for loss of or damage to Exhibitor property, and the Exhibitor agrees to indemnify and hold us and the venue harmless from claims arising out of the Exhibitor&rsquo;s participation.</p><h3>Cancellation by organizer &amp; force majeure</h3><p>We may cancel or reschedule the Event due to circumstances beyond our reasonable control. In the event of cancellation by us, booth fees will be refunded.</p><h3>Governing law</h3><p>These terms are governed by the laws of the State of New Jersey. Questions: [exhibitors@forthefansfest.com].</p>"}}]'::jsonb,
   '<h2>Exhibitor &amp; Booth Sale Terms</h2><p><em>Last updated: June 10, 2026.</em></p><p>These terms govern the reservation and purchase of exhibitor booths at For The Fans Fest (the &ldquo;Event&rdquo;). By reserving a booth you (the &ldquo;Exhibitor&rdquo;) agree to these terms in addition to our <a href="/terms">Terms of Sale &amp; Use</a> and <a href="/policies">Policies</a>.</p><h3>Booth selection &amp; holds</h3><p>Booths are selected from the interactive floor plan and priced by zone (for example, Artist Alley and Exhibitor Hall). When you select a booth we place a temporary <strong>hold</strong> on it so another exhibitor cannot buy it while you check out. The hold expires after a short window (15 minutes by default), after which the booth is automatically released and made available again if checkout is not completed.</p><h3>Payment &amp; confirmation</h3><p>Booth fees are payable in full at checkout through Stripe. <strong>A booth is confirmed and marked sold only after payment succeeds.</strong> Selecting a booth or holding it does not reserve it until payment is complete. Prices are shown on the floor plan in U.S. dollars.</p><h3>Fees &amp; refunds</h3><p>Booth fees are <strong>non-refundable</strong> except where the Event is cancelled by us or as required by law. Booth assignments are final.</p><h3>Transfer &amp; subletting</h3><p>Booths may not be transferred, shared, sublet, or resold without our prior written consent. The booth must be used by the Exhibitor named on the order.</p><h3>Setup, staffing &amp; teardown</h3><p>Exhibitors must set up, staff, and tear down their booth during the published show hours and follow all instructions of show staff, security, and the venue.</p><h3>Conduct &amp; prohibited goods</h3><p>Exhibitors must comply with our code of conduct and bag &amp; prop policy. The sale of counterfeit, infringing, illegal, or unsafe goods, and of functional weapons or realistic firearms, is prohibited. We may remove any Exhibitor in violation without refund.</p><h3>Insurance, liability &amp; indemnification</h3><p>Exhibitors are responsible for their own goods, displays, and personnel and are encouraged to carry their own insurance. To the fullest extent permitted by law, we are not liable for loss of or damage to Exhibitor property, and the Exhibitor agrees to indemnify and hold us and the venue harmless from claims arising out of the Exhibitor&rsquo;s participation.</p><h3>Cancellation by organizer &amp; force majeure</h3><p>We may cancel or reschedule the Event due to circumstances beyond our reasonable control. In the event of cancellation by us, booth fees will be refunded.</p><h3>Governing law</h3><p>These terms are governed by the laws of the State of New Jersey. Questions: [exhibitors@forthefansfest.com].</p>',
   'Exhibitor & Booth Sale Terms | For The Fans Fest', 'Terms for reserving and purchasing exhibitor booths at For The Fans Fest.', TRUE, now())
ON CONFLICT (slug) DO NOTHING;

-- ── editable content pages (managed in the Page Builder). Seeded once with
--    placeholder copy; DO NOTHING so admin edits are never overwritten. ──────
INSERT INTO pages (slug, title, blocks, body_html, seo_title, seo_description, is_published, published_at) VALUES
  ('warlock-awards-banquet', 'Warlock Awards Banquet',
   '[{"type":"heading","data":{"text":"Warlock Awards Banquet"}},{"type":"richtext","data":{"html":"<p>Join us for the Warlock Awards Banquet — an evening celebrating the best of the show. Details, ticketing, and the menu will be announced here soon.</p>"}}]'::jsonb,
   '<h2>Warlock Awards Banquet</h2><p>Join us for the Warlock Awards Banquet — an evening celebrating the best of the show. Details, ticketing, and the menu will be announced here soon.</p>',
   'Warlock Awards Banquet | For The Fans Fest', 'The Warlock Awards Banquet at For The Fans Fest.', TRUE, now()),
  ('graham-nolans-cigar-fest', 'Graham Nolan''s Cigar Fest',
   '[{"type":"heading","data":{"text":"Graham Nolan''s Cigar Fest"}},{"type":"richtext","data":{"html":"<p>Graham Nolan''s Cigar Fest returns to For The Fans Fest. More details on this signature event coming soon.</p>"}}]'::jsonb,
   '<h2>Graham Nolan''s Cigar Fest</h2><p>Graham Nolan''s Cigar Fest returns to For The Fans Fest. More details on this signature event coming soon.</p>',
   'Graham Nolan''s Cigar Fest | For The Fans Fest', 'Graham Nolan''s Cigar Fest at For The Fans Fest.', TRUE, now())
ON CONFLICT (slug) DO NOTHING;

-- ── exhibitor info pages (Retailers, Artist Alley, Corporate, Advertise) now
--    managed in the Page Builder. Seeded once; DO NOTHING preserves admin edits.
INSERT INTO pages (slug, title, blocks, body_html, seo_title, seo_description, is_published, published_at) VALUES
  ('retailers', 'Retailers',
   '[{"type":"image","data":{"url":"/retailers/hero-1.png","alt":"Retailers"}},{"type":"richtext","data":{"html":"<p style=\"font-size:1.1rem\"><strong>Showcase your exclusive merch and unique items with fans who want the newest and hottest in comics, sci-fi, gaming, horror, and more.</strong></p><p>Bring your store to For The Fans Fest. Reach thousands of passionate fans over a packed weekend and sell the merch they’re searching for.</p>"}},{"type":"heading","data":{"text":"Show Info"}},{"type":"image","data":{"url":"/retailers/info.png","alt":"Show information"}},{"type":"richtext","data":{"html":"<p>Mark your calendars for <strong>For The Fans Fest</strong>.</p><ul><li><strong>When:</strong> October 16–18, 2026</li><li><strong>Where:</strong> Harrah’s Resort Atlantic City<br/>777 Harrah’s Blvd, Atlantic City, NJ 08401</li></ul>"}},{"type":"heading","data":{"text":"Pricing"}},{"type":"image","data":{"url":"/retailers/pricing.png","alt":"Pricing"}},{"type":"richtext","data":{"html":"<p>Let’s talk numbers.</p><ul><li><strong>Booth — $250 each</strong> · includes one table + 2 chairs.</li><li><strong>Additional tables — $100 each</strong> (limited availability).</li><li><strong>Hotel rooms</strong> — from $76.99 to $166.99 per night.</li><li><strong>Banquet</strong> — $200 per person (limited seats).</li></ul><p>A deposit (50% of your booth + 60% of add-ons) reserves your space; the balance is due before the show.</p>"}},{"type":"heading","data":{"text":"Ready to apply?"}},{"type":"image","data":{"url":"/retailers/orderforms.png","alt":"Application"}},{"type":"richtext","data":{"html":"<p>Complete the exhibitor application, agree to the terms, pick your booth on the floor plan, and pay your deposit or in full — all in one place.</p>"}},{"type":"button","data":{"label":"Become an Exhibitor","url":"/become-an-exhibitor"}},{"type":"heading","data":{"text":"FAQ"}},{"type":"richtext","data":{"html":"<h3>How do I apply to be at the show?</h3><p>Click “Become an Exhibitor,” complete the application form, agree to the terms, choose your booth, and submit payment. Your participation is not guaranteed until show management approves your application and you receive an acceptance email.</p><h3>What if my application is not approved?</h3><p>If your application is not approved, any refundable payments you made will be returned. The nonrefundable booth deposit is retained per the terms.</p><h3>What comes with a booth?</h3><p>Each booth includes one table and two chairs. Additional tables are available for an extra fee while supplies last.</p><h3>Can I pay a deposit and pay the rest later?</h3><p>Yes. You can pay a deposit (50% of your booth plus 60% of any add-ons) to reserve your space; we’ll send you a link to pay the balance before the show.</p>"}}]'::jsonb,
   '<figure><img src="/retailers/hero-1.png" alt="Retailers" loading="lazy"/></figure>
<div><p style="font-size:1.1rem"><strong>Showcase your exclusive merch and unique items with fans who want the newest and hottest in comics, sci-fi, gaming, horror, and more.</strong></p><p>Bring your store to For The Fans Fest. Reach thousands of passionate fans over a packed weekend and sell the merch they’re searching for.</p></div>
<h2>Show Info</h2>
<figure><img src="/retailers/info.png" alt="Show information" loading="lazy"/></figure>
<div><p>Mark your calendars for <strong>For The Fans Fest</strong>.</p><ul><li><strong>When:</strong> October 16–18, 2026</li><li><strong>Where:</strong> Harrah’s Resort Atlantic City<br/>777 Harrah’s Blvd, Atlantic City, NJ 08401</li></ul></div>
<h2>Pricing</h2>
<figure><img src="/retailers/pricing.png" alt="Pricing" loading="lazy"/></figure>
<div><p>Let’s talk numbers.</p><ul><li><strong>Booth — $250 each</strong> · includes one table + 2 chairs.</li><li><strong>Additional tables — $100 each</strong> (limited availability).</li><li><strong>Hotel rooms</strong> — from $76.99 to $166.99 per night.</li><li><strong>Banquet</strong> — $200 per person (limited seats).</li></ul><p>A deposit (50% of your booth + 60% of add-ons) reserves your space; the balance is due before the show.</p></div>
<h2>Ready to apply?</h2>
<figure><img src="/retailers/orderforms.png" alt="Application" loading="lazy"/></figure>
<div><p>Complete the exhibitor application, agree to the terms, pick your booth on the floor plan, and pay your deposit or in full — all in one place.</p></div>
<p><a class="btn" href="/become-an-exhibitor">Become an Exhibitor</a></p>
<h2>FAQ</h2>
<div><h3>How do I apply to be at the show?</h3><p>Click “Become an Exhibitor,” complete the application form, agree to the terms, choose your booth, and submit payment. Your participation is not guaranteed until show management approves your application and you receive an acceptance email.</p><h3>What if my application is not approved?</h3><p>If your application is not approved, any refundable payments you made will be returned. The nonrefundable booth deposit is retained per the terms.</p><h3>What comes with a booth?</h3><p>Each booth includes one table and two chairs. Additional tables are available for an extra fee while supplies last.</p><h3>Can I pay a deposit and pay the rest later?</h3><p>Yes. You can pay a deposit (50% of your booth plus 60% of any add-ons) to reserve your space; we’ll send you a link to pay the balance before the show.</p></div>',
   'Retailers | For The Fans Fest', 'Retailers at For The Fans Fest — October 16–18, 2026 in Atlantic City.', TRUE, now()),
  ('artist-alley', 'Artist Alley',
   '[{"type":"image","data":{"url":"/retailers/hero-1.png","alt":"Artist Alley"}},{"type":"richtext","data":{"html":"<p style=\"font-size:1.1rem\"><strong>Are you a creator who makes one-of-a-kind artwork, commissions, sculptures, jewelry, pins, and buttons? Share your art — apply for Artist Alley.</strong></p><p>Artist Alley is the heart of the show. Set up your table, meet fans face to face, and sell your original work all weekend long.</p>"}},{"type":"heading","data":{"text":"Show Info"}},{"type":"image","data":{"url":"/retailers/info.png","alt":"Show information"}},{"type":"richtext","data":{"html":"<p>Mark your calendars for <strong>For The Fans Fest</strong>.</p><ul><li><strong>When:</strong> October 16–18, 2026</li><li><strong>Where:</strong> Harrah’s Resort Atlantic City<br/>777 Harrah’s Blvd, Atlantic City, NJ 08401</li></ul>"}},{"type":"heading","data":{"text":"Pricing"}},{"type":"image","data":{"url":"/retailers/pricing.png","alt":"Pricing"}},{"type":"richtext","data":{"html":"<p>Let’s talk numbers.</p><ul><li><strong>Booth — $250 each</strong> · includes one table + 2 chairs.</li><li><strong>Additional tables — $100 each</strong> (limited availability).</li><li><strong>Hotel rooms</strong> — from $76.99 to $166.99 per night.</li><li><strong>Banquet</strong> — $200 per person (limited seats).</li></ul><p>A deposit (50% of your booth + 60% of add-ons) reserves your space; the balance is due before the show.</p>"}},{"type":"heading","data":{"text":"Ready to apply?"}},{"type":"image","data":{"url":"/retailers/orderforms.png","alt":"Application"}},{"type":"richtext","data":{"html":"<p>Complete the exhibitor application, agree to the terms, pick your booth on the floor plan, and pay your deposit or in full — all in one place.</p>"}},{"type":"button","data":{"label":"Become an Exhibitor","url":"/become-an-exhibitor"}},{"type":"heading","data":{"text":"FAQ"}},{"type":"richtext","data":{"html":"<h3>How do I apply for Artist Alley?</h3><p>Click “Become an Exhibitor,” complete the application, agree to the terms, choose your table, and submit payment. Your spot is not guaranteed until show management approves your application and you receive an acceptance email.</p><h3>Who can apply?</h3><p>Amateur and professional creators who make original artwork, commissions, prints, sculptures, jewelry, pins, buttons, and other handmade work.</p><h3>What comes with a space?</h3><p>Each space includes a table and two chairs. Additional tables are available for an extra fee while supplies last.</p><h3>Can I pay a deposit and pay the rest later?</h3><p>Yes. A deposit (50% of your booth plus 60% of any add-ons) reserves your space; we’ll email you a link to pay the balance before the show.</p>"}}]'::jsonb,
   '<figure><img src="/retailers/hero-1.png" alt="Artist Alley" loading="lazy"/></figure>
<div><p style="font-size:1.1rem"><strong>Are you a creator who makes one-of-a-kind artwork, commissions, sculptures, jewelry, pins, and buttons? Share your art — apply for Artist Alley.</strong></p><p>Artist Alley is the heart of the show. Set up your table, meet fans face to face, and sell your original work all weekend long.</p></div>
<h2>Show Info</h2>
<figure><img src="/retailers/info.png" alt="Show information" loading="lazy"/></figure>
<div><p>Mark your calendars for <strong>For The Fans Fest</strong>.</p><ul><li><strong>When:</strong> October 16–18, 2026</li><li><strong>Where:</strong> Harrah’s Resort Atlantic City<br/>777 Harrah’s Blvd, Atlantic City, NJ 08401</li></ul></div>
<h2>Pricing</h2>
<figure><img src="/retailers/pricing.png" alt="Pricing" loading="lazy"/></figure>
<div><p>Let’s talk numbers.</p><ul><li><strong>Booth — $250 each</strong> · includes one table + 2 chairs.</li><li><strong>Additional tables — $100 each</strong> (limited availability).</li><li><strong>Hotel rooms</strong> — from $76.99 to $166.99 per night.</li><li><strong>Banquet</strong> — $200 per person (limited seats).</li></ul><p>A deposit (50% of your booth + 60% of add-ons) reserves your space; the balance is due before the show.</p></div>
<h2>Ready to apply?</h2>
<figure><img src="/retailers/orderforms.png" alt="Application" loading="lazy"/></figure>
<div><p>Complete the exhibitor application, agree to the terms, pick your booth on the floor plan, and pay your deposit or in full — all in one place.</p></div>
<p><a class="btn" href="/become-an-exhibitor">Become an Exhibitor</a></p>
<h2>FAQ</h2>
<div><h3>How do I apply for Artist Alley?</h3><p>Click “Become an Exhibitor,” complete the application, agree to the terms, choose your table, and submit payment. Your spot is not guaranteed until show management approves your application and you receive an acceptance email.</p><h3>Who can apply?</h3><p>Amateur and professional creators who make original artwork, commissions, prints, sculptures, jewelry, pins, buttons, and other handmade work.</p><h3>What comes with a space?</h3><p>Each space includes a table and two chairs. Additional tables are available for an extra fee while supplies last.</p><h3>Can I pay a deposit and pay the rest later?</h3><p>Yes. A deposit (50% of your booth plus 60% of any add-ons) reserves your space; we’ll email you a link to pay the balance before the show.</p></div>',
   'Artist Alley | For The Fans Fest', 'Artist Alley at For The Fans Fest — October 16–18, 2026 in Atlantic City.', TRUE, now()),
  ('corporate', 'Corporate Partnerships, Exhibiting & Sponsorship',
   '[{"type":"image","data":{"url":"/retailers/hero-corporate.png","alt":"Corporate Partnerships"}},{"type":"richtext","data":{"html":"<p style=\"font-size:1.1rem\">Put your brand in front of thousands of passionate fans at For The Fans Fest.</p>"}},{"type":"image","data":{"url":"/retailers/engage.png","alt":"Engage"}},{"type":"heading","data":{"text":"Engage"}},{"type":"richtext","data":{"html":"<p>Over a fan-filled weekend, connect with thousands of attendees at your booth.</p>"}},{"type":"button","data":{"label":"Contact Us","url":"/contact-us"}},{"type":"image","data":{"url":"/retailers/connect.png","alt":"Connect"}},{"type":"heading","data":{"text":"Connect"}},{"type":"richtext","data":{"html":"<p>Join our partners who tap into digital and social marketing channels leading up to, during, and even after the event to drive sales.</p><p>Reach our fans through display, email, and social campaigns.</p>"}},{"type":"button","data":{"label":"Contact Us","url":"/contact-us"}},{"type":"image","data":{"url":"/retailers/partners.png","alt":"Corporate Partners"}},{"type":"heading","data":{"text":"Corporate Partners"}},{"type":"richtext","data":{"html":"<p>Our partners love our fans… and our fans love our partners!</p><p>For The Fans Fest is proud to connect the world’s leading brands and the new up-and-comers to our passionate audience.</p>"}},{"type":"button","data":{"label":"Contact Us","url":"/contact-us"}}]'::jsonb,
   '<figure><img src="/retailers/hero-corporate.png" alt="Corporate Partnerships" loading="lazy"/></figure>
<div><p style="font-size:1.1rem">Put your brand in front of thousands of passionate fans at For The Fans Fest.</p></div>
<figure><img src="/retailers/engage.png" alt="Engage" loading="lazy"/></figure>
<h2>Engage</h2>
<div><p>Over a fan-filled weekend, connect with thousands of attendees at your booth.</p></div>
<p><a class="btn" href="/contact-us">Contact Us</a></p>
<figure><img src="/retailers/connect.png" alt="Connect" loading="lazy"/></figure>
<h2>Connect</h2>
<div><p>Join our partners who tap into digital and social marketing channels leading up to, during, and even after the event to drive sales.</p><p>Reach our fans through display, email, and social campaigns.</p></div>
<p><a class="btn" href="/contact-us">Contact Us</a></p>
<figure><img src="/retailers/partners.png" alt="Corporate Partners" loading="lazy"/></figure>
<h2>Corporate Partners</h2>
<div><p>Our partners love our fans… and our fans love our partners!</p><p>For The Fans Fest is proud to connect the world’s leading brands and the new up-and-comers to our passionate audience.</p></div>
<p><a class="btn" href="/contact-us">Contact Us</a></p>',
   'Corporate Partnerships, Exhibiting & Sponsorship | For The Fans Fest', 'Corporate Partnerships, Exhibiting & Sponsorship at For The Fans Fest — October 16–18, 2026 in Atlantic City.', TRUE, now()),
  ('advertise', 'Advertise With Us',
   '[{"type":"image","data":{"url":"/retailers/hero-advertise.png","alt":"Advertise With Us"}},{"type":"richtext","data":{"html":"<p style=\"font-size:1.1rem\">Reach thousands of passionate pop-culture fans before, during, and after For The Fans Fest.</p>"}},{"type":"image","data":{"url":"/retailers/newsletter.png","alt":"The For The Fans Fest newsletter"}},{"type":"heading","data":{"text":"The For The Fans Fest Newsletter"}},{"type":"richtext","data":{"html":"<p>Your monthly fan-stop for everything in pop culture — TV, film, anime, horror, comics, and more.</p><p>Reach our subscribers with advertorials, content marketing, and display advertising opportunities.</p>"}},{"type":"button","data":{"label":"Contact Us","url":"/contact-us"}},{"type":"image","data":{"url":"/retailers/display.png","alt":"Display advertising"}},{"type":"heading","data":{"text":"Display Advertising"}},{"type":"richtext","data":{"html":"<p>Turnkey, CPM-based digital advertising opportunities.</p><p>Want to dream big? Show takeovers and full-event campaigns are our specialty.</p>"}},{"type":"button","data":{"label":"Contact Us","url":"/contact-us"}},{"type":"image","data":{"url":"/retailers/signage.png","alt":"Digital out-of-home and signage"}},{"type":"heading","data":{"text":"Digital OOH & Signage"}},{"type":"richtext","data":{"html":"<p>Share your sizzle reels, trailers, clips, and 60-second spots with our attendees on our largest stages and in the walkways throughout the venue.</p>"}},{"type":"button","data":{"label":"Contact Us","url":"/contact-us"}}]'::jsonb,
   '<figure><img src="/retailers/hero-advertise.png" alt="Advertise With Us" loading="lazy"/></figure>
<div><p style="font-size:1.1rem">Reach thousands of passionate pop-culture fans before, during, and after For The Fans Fest.</p></div>
<figure><img src="/retailers/newsletter.png" alt="The For The Fans Fest newsletter" loading="lazy"/></figure>
<h2>The For The Fans Fest Newsletter</h2>
<div><p>Your monthly fan-stop for everything in pop culture — TV, film, anime, horror, comics, and more.</p><p>Reach our subscribers with advertorials, content marketing, and display advertising opportunities.</p></div>
<p><a class="btn" href="/contact-us">Contact Us</a></p>
<figure><img src="/retailers/display.png" alt="Display advertising" loading="lazy"/></figure>
<h2>Display Advertising</h2>
<div><p>Turnkey, CPM-based digital advertising opportunities.</p><p>Want to dream big? Show takeovers and full-event campaigns are our specialty.</p></div>
<p><a class="btn" href="/contact-us">Contact Us</a></p>
<figure><img src="/retailers/signage.png" alt="Digital out-of-home and signage" loading="lazy"/></figure>
<h2>Digital OOH &amp; Signage</h2>
<div><p>Share your sizzle reels, trailers, clips, and 60-second spots with our attendees on our largest stages and in the walkways throughout the venue.</p></div>
<p><a class="btn" href="/contact-us">Contact Us</a></p>',
   'Advertise With Us | For The Fans Fest', 'Advertise With Us at For The Fans Fest — October 16–18, 2026 in Atlantic City.', TRUE, now())
ON CONFLICT (slug) DO NOTHING;


-- ── one-time content migrations ──────────────────────────────────────────────
-- The page rows above are seeded with ON CONFLICT DO NOTHING so admin edits are
-- never overwritten. The fixes below patch DBs that were seeded before these
-- corrections existed, and are each guarded so they only touch the original
-- default content (admin-edited pages are left untouched) and are idempotent.

-- Strip literal "&amp;" that leaked into page TITLES (titles are rendered as
-- text, not HTML, so the entity showed through — e.g. "Terms of Sale &amp; Use").
UPDATE pages SET title = replace(title, '&amp;', '&') WHERE title LIKE '%&amp;%';

-- Refresh the About Us copy on DBs that still carry the original placeholder
-- ("by fans, for fans."). Guarded so an admin-edited About page is preserved.
UPDATE pages SET
  blocks = '[{"type":"heading","data":{"text":"About For The Fans Fest"}},{"type":"richtext","data":{"html":"<p>For more than a decade, the independent comic scene has exploded across social media, building an incredible online community of untapped, unshackled creativity. For The Fans Fest exists to bring that cultural movement off the screen and directly to the fans.</p><p>Each October we take over Harrah&rsquo;s Resort &amp; Casino in the heart of Atlantic City, New Jersey for a weekend-long celebration of indie comics and collectibles. Our 2026 show runs October 16&ndash;18 and features the very first Warlock Comic Awards Banquet, two full days of live streams and panels with the very best in the indie comic book scene, and an exclusive comic and toy convention floor open to all fans.</p><p>Come party and celebrate with some of the best professionals in the business &mdash; Ethan Van Sciver, Chuck Dixon, Billy Tucci, Graham Nolan, Jon Malin, Shane Davis, Mandy Summers, Shanth Enjeti, Andy Smith, Mike Baron, Vasilis Lolos, and many, many more to be announced.</p><p>See you there!</p>"}}]'::jsonb,
  body_html = '<h2>About For The Fans Fest</h2><p>For more than a decade, the independent comic scene has exploded across social media, building an incredible online community of untapped, unshackled creativity. For The Fans Fest exists to bring that cultural movement off the screen and directly to the fans.</p><p>Each October we take over Harrah&rsquo;s Resort &amp; Casino in the heart of Atlantic City, New Jersey for a weekend-long celebration of indie comics and collectibles. Our 2026 show runs October 16&ndash;18 and features the very first Warlock Comic Awards Banquet, two full days of live streams and panels with the very best in the indie comic book scene, and an exclusive comic and toy convention floor open to all fans.</p><p>Come party and celebrate with some of the best professionals in the business &mdash; Ethan Van Sciver, Chuck Dixon, Billy Tucci, Graham Nolan, Jon Malin, Shane Davis, Mandy Summers, Shanth Enjeti, Andy Smith, Mike Baron, Vasilis Lolos, and many, many more to be announced.</p><p>See you there!</p>'
WHERE slug = 'about-us' AND body_html LIKE '%by fans, for fans.%';

-- Hero slides are fully admin-managed (Hero Slides). Seeding intentionally does
-- NOT touch the `slides` table, so admin-configured sliders are never
-- overwritten on deploy/re-seed. (HeroCarousel shows the brand logo when there
-- are no slides.)

-- ── booths (default vendor floor inventory; admin replaces via the editor) ───
-- ── booths: 140 Wildwood Ballroom tables (from docs/floor-plan/booths.json)
-- Normalized coords for the table's 0-1 CHECK; the SVG map renders from the
-- feet geometry. Idempotent: refresh layout/tier/price but preserve sale state.
-- Remove pre-existing sample booths (uppercase labels) that aren't sold.
DELETE FROM booths WHERE label ~ '^[A-Z][0-9]+$' AND status <> 'sold';
INSERT INTO booths (label, zone, price_cents, pos_x, pos_y, width, height, tier, facing) VALUES
  ('g1', 'standard', 35000, 0.03984, 0.43995, 0.03984, 0.04061, 'standard', 'N'),
  ('g2', 'standard', 35000, 0.07968, 0.43995, 0.03984, 0.04061, 'standard', 'N'),
  ('g3', 'standard', 35000, 0.11952, 0.43995, 0.03984, 0.04061, 'standard', 'N'),
  ('g4', 'standard', 35000, 0.15936, 0.43995, 0.03984, 0.04061, 'standard', 'N'),
  ('g5', 'standard', 35000, 0.1992, 0.43995, 0.03984, 0.04061, 'standard', 'N'),
  ('g6', 'standard', 35000, 0.27888, 0.43995, 0.03984, 0.04061, 'standard', 'N'),
  ('g7', 'standard', 35000, 0.31873, 0.43995, 0.03984, 0.04061, 'standard', 'N'),
  ('g8', 'standard', 35000, 0.35857, 0.43995, 0.03984, 0.04061, 'standard', 'N'),
  ('g9', 'standard', 35000, 0.39841, 0.43995, 0.03984, 0.04061, 'standard', 'N'),
  ('g10', 'standard', 35000, 0.43825, 0.43995, 0.03984, 0.04061, 'standard', 'N'),
  ('g11', 'standard', 35000, 0.51793, 0.43995, 0.03984, 0.04061, 'standard', 'N'),
  ('g12', 'standard', 35000, 0.55777, 0.43995, 0.03984, 0.04061, 'standard', 'N'),
  ('g13', 'standard', 35000, 0.59761, 0.43995, 0.03984, 0.04061, 'standard', 'N'),
  ('g14', 'standard', 35000, 0.63745, 0.43995, 0.03984, 0.04061, 'standard', 'N'),
  ('g15', 'standard', 35000, 0.67729, 0.43995, 0.03984, 0.04061, 'standard', 'N'),
  ('g16', 'standard', 35000, 0.75697, 0.43995, 0.03984, 0.04061, 'standard', 'N'),
  ('g17', 'standard', 35000, 0.79681, 0.43995, 0.03984, 0.04061, 'standard', 'N'),
  ('g18', 'standard', 35000, 0.83665, 0.43995, 0.03984, 0.04061, 'standard', 'N'),
  ('g19', 'standard', 35000, 0.87649, 0.43995, 0.03984, 0.04061, 'standard', 'N'),
  ('g20', 'standard', 35000, 0.91633, 0.43995, 0.03984, 0.04061, 'standard', 'N'),
  ('f1', 'standard', 35000, 0.03984, 0.48056, 0.03984, 0.04061, 'standard', 'S'),
  ('f2', 'standard', 35000, 0.07968, 0.48056, 0.03984, 0.04061, 'standard', 'S'),
  ('f3', 'standard', 35000, 0.11952, 0.48056, 0.03984, 0.04061, 'standard', 'S'),
  ('f4', 'standard', 35000, 0.15936, 0.48056, 0.03984, 0.04061, 'standard', 'S'),
  ('f5', 'standard', 35000, 0.1992, 0.48056, 0.03984, 0.04061, 'standard', 'S'),
  ('f6', 'standard', 35000, 0.27888, 0.48056, 0.03984, 0.04061, 'standard', 'S'),
  ('f7', 'standard', 35000, 0.31873, 0.48056, 0.03984, 0.04061, 'standard', 'S'),
  ('f8', 'standard', 35000, 0.35857, 0.48056, 0.03984, 0.04061, 'standard', 'S'),
  ('f9', 'standard', 35000, 0.39841, 0.48056, 0.03984, 0.04061, 'standard', 'S'),
  ('f10', 'standard', 35000, 0.43825, 0.48056, 0.03984, 0.04061, 'standard', 'S'),
  ('f11', 'standard', 35000, 0.51793, 0.48056, 0.03984, 0.04061, 'standard', 'S'),
  ('f12', 'standard', 35000, 0.55777, 0.48056, 0.03984, 0.04061, 'standard', 'S'),
  ('f13', 'standard', 35000, 0.59761, 0.48056, 0.03984, 0.04061, 'standard', 'S'),
  ('f14', 'standard', 35000, 0.63745, 0.48056, 0.03984, 0.04061, 'standard', 'S'),
  ('f15', 'standard', 35000, 0.67729, 0.48056, 0.03984, 0.04061, 'standard', 'S'),
  ('f16', 'standard', 35000, 0.75697, 0.48056, 0.03984, 0.04061, 'standard', 'S'),
  ('f17', 'standard', 35000, 0.79681, 0.48056, 0.03984, 0.04061, 'standard', 'S'),
  ('f18', 'standard', 35000, 0.83665, 0.48056, 0.03984, 0.04061, 'standard', 'S'),
  ('f19', 'standard', 35000, 0.87649, 0.48056, 0.03984, 0.04061, 'standard', 'S'),
  ('f20', 'standard', 35000, 0.91633, 0.48056, 0.03984, 0.04061, 'standard', 'S'),
  ('e1', 'standard', 35000, 0.03984, 0.57193, 0.03984, 0.04061, 'standard', 'N'),
  ('e2', 'standard', 35000, 0.07968, 0.57193, 0.03984, 0.04061, 'standard', 'N'),
  ('e3', 'standard', 35000, 0.11952, 0.57193, 0.03984, 0.04061, 'standard', 'N'),
  ('e4', 'standard', 35000, 0.15936, 0.57193, 0.03984, 0.04061, 'standard', 'N'),
  ('e5', 'standard', 35000, 0.1992, 0.57193, 0.03984, 0.04061, 'standard', 'N'),
  ('e6', 'standard', 35000, 0.27888, 0.57193, 0.03984, 0.04061, 'standard', 'N'),
  ('e7', 'standard', 35000, 0.31873, 0.57193, 0.03984, 0.04061, 'standard', 'N'),
  ('e8', 'standard', 35000, 0.35857, 0.57193, 0.03984, 0.04061, 'standard', 'N'),
  ('e9', 'standard', 35000, 0.39841, 0.57193, 0.03984, 0.04061, 'standard', 'N'),
  ('e10', 'standard', 35000, 0.43825, 0.57193, 0.03984, 0.04061, 'standard', 'N'),
  ('e11', 'standard', 35000, 0.51793, 0.57193, 0.03984, 0.04061, 'standard', 'N'),
  ('e12', 'standard', 35000, 0.55777, 0.57193, 0.03984, 0.04061, 'standard', 'N'),
  ('e13', 'standard', 35000, 0.59761, 0.57193, 0.03984, 0.04061, 'standard', 'N'),
  ('e14', 'standard', 35000, 0.63745, 0.57193, 0.03984, 0.04061, 'standard', 'N'),
  ('e15', 'standard', 35000, 0.67729, 0.57193, 0.03984, 0.04061, 'standard', 'N'),
  ('e16', 'standard', 35000, 0.75697, 0.57193, 0.03984, 0.04061, 'standard', 'N'),
  ('e17', 'standard', 35000, 0.79681, 0.57193, 0.03984, 0.04061, 'standard', 'N'),
  ('e18', 'standard', 35000, 0.83665, 0.57193, 0.03984, 0.04061, 'standard', 'N'),
  ('e19', 'standard', 35000, 0.87649, 0.57193, 0.03984, 0.04061, 'standard', 'N'),
  ('e20', 'standard', 35000, 0.91633, 0.57193, 0.03984, 0.04061, 'standard', 'N'),
  ('d1', 'standard', 35000, 0.03984, 0.61254, 0.03984, 0.04061, 'standard', 'S'),
  ('d2', 'standard', 35000, 0.07968, 0.61254, 0.03984, 0.04061, 'standard', 'S'),
  ('d3', 'standard', 35000, 0.11952, 0.61254, 0.03984, 0.04061, 'standard', 'S'),
  ('d4', 'standard', 35000, 0.15936, 0.61254, 0.03984, 0.04061, 'standard', 'S'),
  ('d5', 'standard', 35000, 0.1992, 0.61254, 0.03984, 0.04061, 'standard', 'S'),
  ('d6', 'standard', 35000, 0.27888, 0.61254, 0.03984, 0.04061, 'standard', 'S'),
  ('d7', 'standard', 35000, 0.31873, 0.61254, 0.03984, 0.04061, 'standard', 'S'),
  ('d8', 'standard', 35000, 0.35857, 0.61254, 0.03984, 0.04061, 'standard', 'S'),
  ('d9', 'standard', 35000, 0.39841, 0.61254, 0.03984, 0.04061, 'standard', 'S'),
  ('d10', 'standard', 35000, 0.43825, 0.61254, 0.03984, 0.04061, 'standard', 'S'),
  ('d11', 'standard', 35000, 0.51793, 0.61254, 0.03984, 0.04061, 'standard', 'S'),
  ('d12', 'standard', 35000, 0.55777, 0.61254, 0.03984, 0.04061, 'standard', 'S'),
  ('d13', 'standard', 35000, 0.59761, 0.61254, 0.03984, 0.04061, 'standard', 'S'),
  ('d14', 'standard', 35000, 0.63745, 0.61254, 0.03984, 0.04061, 'standard', 'S'),
  ('d15', 'standard', 35000, 0.67729, 0.61254, 0.03984, 0.04061, 'standard', 'S'),
  ('d16', 'standard', 35000, 0.75697, 0.61254, 0.03984, 0.04061, 'standard', 'S'),
  ('d17', 'standard', 35000, 0.79681, 0.61254, 0.03984, 0.04061, 'standard', 'S'),
  ('d18', 'standard', 35000, 0.83665, 0.61254, 0.03984, 0.04061, 'standard', 'S'),
  ('d19', 'standard', 35000, 0.87649, 0.61254, 0.03984, 0.04061, 'standard', 'S'),
  ('d20', 'standard', 35000, 0.91633, 0.61254, 0.03984, 0.04061, 'standard', 'S'),
  ('c1', 'standard', 35000, 0.03984, 0.70391, 0.03984, 0.04061, 'standard', 'N'),
  ('c2', 'standard', 35000, 0.07968, 0.70391, 0.03984, 0.04061, 'standard', 'N'),
  ('c3', 'standard', 35000, 0.11952, 0.70391, 0.03984, 0.04061, 'standard', 'N'),
  ('c4', 'standard', 35000, 0.15936, 0.70391, 0.03984, 0.04061, 'standard', 'N'),
  ('c5', 'standard', 35000, 0.1992, 0.70391, 0.03984, 0.04061, 'standard', 'N'),
  ('c6', 'standard', 35000, 0.27888, 0.70391, 0.03984, 0.04061, 'standard', 'N'),
  ('c7', 'standard', 35000, 0.31873, 0.70391, 0.03984, 0.04061, 'standard', 'N'),
  ('c8', 'standard', 35000, 0.35857, 0.70391, 0.03984, 0.04061, 'standard', 'N'),
  ('c9', 'standard', 35000, 0.39841, 0.70391, 0.03984, 0.04061, 'standard', 'N'),
  ('c10', 'standard', 35000, 0.43825, 0.70391, 0.03984, 0.04061, 'standard', 'N'),
  ('c11', 'standard', 35000, 0.51793, 0.70391, 0.03984, 0.04061, 'standard', 'N'),
  ('c12', 'standard', 35000, 0.55777, 0.70391, 0.03984, 0.04061, 'standard', 'N'),
  ('c13', 'standard', 35000, 0.59761, 0.70391, 0.03984, 0.04061, 'standard', 'N'),
  ('c14', 'standard', 35000, 0.63745, 0.70391, 0.03984, 0.04061, 'standard', 'N'),
  ('c15', 'standard', 35000, 0.67729, 0.70391, 0.03984, 0.04061, 'standard', 'N'),
  ('c16', 'standard', 35000, 0.75697, 0.70391, 0.03984, 0.04061, 'standard', 'N'),
  ('c17', 'standard', 35000, 0.79681, 0.70391, 0.03984, 0.04061, 'standard', 'N'),
  ('c18', 'standard', 35000, 0.83665, 0.70391, 0.03984, 0.04061, 'standard', 'N'),
  ('c19', 'standard', 35000, 0.87649, 0.70391, 0.03984, 0.04061, 'standard', 'N'),
  ('c20', 'standard', 35000, 0.91633, 0.70391, 0.03984, 0.04061, 'standard', 'N'),
  ('b1', 'standard', 35000, 0.03984, 0.74452, 0.03984, 0.04061, 'standard', 'S'),
  ('b2', 'standard', 35000, 0.07968, 0.74452, 0.03984, 0.04061, 'standard', 'S'),
  ('b3', 'standard', 35000, 0.11952, 0.74452, 0.03984, 0.04061, 'standard', 'S'),
  ('b4', 'standard', 35000, 0.15936, 0.74452, 0.03984, 0.04061, 'standard', 'S'),
  ('b5', 'standard', 35000, 0.1992, 0.74452, 0.03984, 0.04061, 'standard', 'S'),
  ('b6', 'standard', 35000, 0.27888, 0.74452, 0.03984, 0.04061, 'standard', 'S'),
  ('b7', 'standard', 35000, 0.31873, 0.74452, 0.03984, 0.04061, 'standard', 'S'),
  ('b8', 'standard', 35000, 0.35857, 0.74452, 0.03984, 0.04061, 'standard', 'S'),
  ('b9', 'standard', 35000, 0.39841, 0.74452, 0.03984, 0.04061, 'standard', 'S'),
  ('b10', 'standard', 35000, 0.43825, 0.74452, 0.03984, 0.04061, 'standard', 'S'),
  ('b11', 'standard', 35000, 0.51793, 0.74452, 0.03984, 0.04061, 'standard', 'S'),
  ('b12', 'standard', 35000, 0.55777, 0.74452, 0.03984, 0.04061, 'standard', 'S'),
  ('b13', 'standard', 35000, 0.59761, 0.74452, 0.03984, 0.04061, 'standard', 'S'),
  ('b14', 'standard', 35000, 0.63745, 0.74452, 0.03984, 0.04061, 'standard', 'S'),
  ('b15', 'standard', 35000, 0.67729, 0.74452, 0.03984, 0.04061, 'standard', 'S'),
  ('b16', 'standard', 35000, 0.75697, 0.74452, 0.03984, 0.04061, 'standard', 'S'),
  ('b17', 'standard', 35000, 0.79681, 0.74452, 0.03984, 0.04061, 'standard', 'S'),
  ('b18', 'standard', 35000, 0.83665, 0.74452, 0.03984, 0.04061, 'standard', 'S'),
  ('b19', 'standard', 35000, 0.87649, 0.74452, 0.03984, 0.04061, 'standard', 'S'),
  ('b20', 'standard', 35000, 0.91633, 0.74452, 0.03984, 0.04061, 'standard', 'S'),
  ('a1', 'featured', 50000, 0.03984, 0.90863, 0.03984, 0.04061, 'featured', 'N'),
  ('a2', 'featured', 50000, 0.07968, 0.90863, 0.03984, 0.04061, 'featured', 'N'),
  ('a3', 'featured', 50000, 0.11952, 0.90863, 0.03984, 0.04061, 'featured', 'N'),
  ('a4', 'featured', 50000, 0.15936, 0.90863, 0.03984, 0.04061, 'featured', 'N'),
  ('a5', 'featured', 50000, 0.1992, 0.90863, 0.03984, 0.04061, 'featured', 'N'),
  ('a6', 'featured', 50000, 0.27888, 0.90863, 0.03984, 0.04061, 'featured', 'N'),
  ('a7', 'featured', 50000, 0.31873, 0.90863, 0.03984, 0.04061, 'featured', 'N'),
  ('a8', 'featured', 50000, 0.35857, 0.90863, 0.03984, 0.04061, 'featured', 'N'),
  ('a9', 'featured', 50000, 0.39841, 0.90863, 0.03984, 0.04061, 'featured', 'N'),
  ('a10', 'featured', 50000, 0.43825, 0.90863, 0.03984, 0.04061, 'featured', 'N'),
  ('a11', 'featured', 50000, 0.51793, 0.90863, 0.03984, 0.04061, 'featured', 'N'),
  ('a12', 'featured', 50000, 0.55777, 0.90863, 0.03984, 0.04061, 'featured', 'N'),
  ('a13', 'featured', 50000, 0.59761, 0.90863, 0.03984, 0.04061, 'featured', 'N'),
  ('a14', 'featured', 50000, 0.63745, 0.90863, 0.03984, 0.04061, 'featured', 'N'),
  ('a15', 'featured', 50000, 0.67729, 0.90863, 0.03984, 0.04061, 'featured', 'N'),
  ('a16', 'featured', 50000, 0.75697, 0.90863, 0.03984, 0.04061, 'featured', 'N'),
  ('a17', 'featured', 50000, 0.79681, 0.90863, 0.03984, 0.04061, 'featured', 'N'),
  ('a18', 'featured', 50000, 0.83665, 0.90863, 0.03984, 0.04061, 'featured', 'N'),
  ('a19', 'featured', 50000, 0.87649, 0.90863, 0.03984, 0.04061, 'featured', 'N'),
  ('a20', 'featured', 50000, 0.91633, 0.90863, 0.03984, 0.04061, 'featured', 'N')
ON CONFLICT (label) DO NOTHING;

-- ── store products (default merch, seeded ONLY when the catalog is empty so
--    deleted defaults are never re-added and admin products are never touched) ──
DO $$
DECLARE tee UUID; poster UUID; pins UUID;
BEGIN
  IF EXISTS (SELECT 1 FROM products) THEN RETURN; END IF;
  INSERT INTO products (slug, title, description, price_cents, sort_order) VALUES
    ('event-tee',          'Official Event T-Shirt', 'Soft cotton tee with this year''s show art.', 2500, 1),
    ('commemorative-poster','Commemorative Poster',  '18×24 print, limited run.',                   1500, 2),
    ('enamel-pin-set',     'Enamel Pin Set',         'Set of 3 collectible enamel pins.',            1200, 3);
  SELECT id INTO tee FROM products WHERE slug='event-tee';
  SELECT id INTO poster FROM products WHERE slug='commemorative-poster';
  SELECT id INTO pins FROM products WHERE slug='enamel-pin-set';
  INSERT INTO product_variants (product_id, sku, options, inventory) VALUES
    (tee, 'TEE-S',  '{"size":"S"}',  50),
    (tee, 'TEE-M',  '{"size":"M"}',  80),
    (tee, 'TEE-L',  '{"size":"L"}',  80),
    (tee, 'TEE-XL', '{"size":"XL"}', 40),
    (poster, 'POSTER', '{}', 200),
    (pins, 'PINSET', '{}', 120);
END $$;

-- ── FAQs ─────────────────────────────────────────────────────────────────────
INSERT INTO faqs (question, answer, sort_order)
SELECT v.question, v.answer, v.sort_order
  FROM (VALUES
    ('Where is the convention held?', 'At Harrah''s Resort Atlantic City, NJ.', 1),
    ('Are tickets refundable?', 'All sales are final unless the event is cancelled.', 2)
  ) AS v(question, answer, sort_order)
 WHERE NOT EXISTS (SELECT 1 FROM faqs);

-- Extra-table inventory pool for exhibitors (oversell-safe). Admin can adjust
-- the total in the admin panel. Default 20 additional tables available.
INSERT INTO inventory_pools (key, label, total)
VALUES ('extra_tables', 'Additional vendor tables', 20)
ON CONFLICT (key) DO NOTHING;

-- (Home hero slides are intentionally NOT seeded — they are admin-managed and
-- must never be overwritten on re-seed. See the home-hero note above.)

-- ── Backfill: issue ticket rows for paid orders that are missing them ─────────
-- Digital tickets purchased before digital rows were issued (and any other
-- shortfall) get materialized here so every paid seat is tracked/counted in
-- Admin → Tickets. Idempotent: inserts only (purchased qty − existing rows) per
-- order+type, so re-running on each deploy is a no-op once filled. Does NOT touch
-- quantity_sold (already incremented at original fulfillment).
INSERT INTO tickets (order_id, ticket_type_id, attendee_name, qr_token)
SELECT oi.order_id, oi.ticket_type_id, o.customer_name,
       encode(gen_random_bytes(24), 'hex')
  FROM order_items oi
  JOIN orders o ON o.id = oi.order_id
  CROSS JOIN LATERAL generate_series(
    1,
    GREATEST(0, oi.quantity - (
      SELECT count(*) FROM tickets t
       WHERE t.order_id = oi.order_id AND t.ticket_type_id = oi.ticket_type_id
    ))
  ) AS g
 WHERE oi.kind = 'ticket'
   AND oi.ticket_type_id IS NOT NULL
   AND o.status = 'paid';
