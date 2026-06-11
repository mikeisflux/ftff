#!/usr/bin/env python3
"""Build the compliance/legal CMS pages and splice them into server/db/seed.sql.

Source facts harvested from the codebase:
  - Operator / event: For The Fans Fest (show_info seed)
  - Venue / jurisdiction: Harrah's Resort, Atlantic City, NJ -> New Jersey law
  - Payments: Stripe hosted Checkout (card data never touches our servers, SAQ A)
  - Email: SendGrid (transactional + marketing)
  - Embedded third parties: Cloudflare Stream, Google Maps, Google reCAPTCHA
  - Data collected: name, email, phone, US/CA shipping address, support msgs
  - Booth/vendor flow: floor-plan pick -> soft hold (vendor.hold_minutes,
    default 15) -> Stripe payment -> booth marked sold; expired holds released;
    zones Artist Alley ($350) and Exhibitor Hall ($750)
  - Existing Policies page: ticket sales final/non-refundable unless cancelled,
    non-transferable after check-in, code of conduct, bag & prop policy
"""
import json

SEED = "server/db/seed.sql"
EFFECTIVE = "June 10, 2026"
ORG = "For The Fans Fest"

# Pages: (slug, title, [(heading, html), ...], seo_title, seo_description)
PAGES = [
    (
        "privacy-policy", "Privacy Policy",
        [
            ("Privacy Policy",
             f"<p><em>Last updated: {EFFECTIVE}.</em></p>"
             f"<p>This Privacy Policy explains how {ORG} (&ldquo;we,&rdquo; &ldquo;us,&rdquo; or &ldquo;our&rdquo;) "
             "collects, uses, and shares information when you visit our website, buy tickets or "
             "merchandise, reserve an exhibitor booth, or attend our event. By using the site you "
             "agree to this policy.</p>"
             "<h3>Information we collect</h3>"
             "<ul>"
             "<li><strong>Contact &amp; order details</strong> you provide at checkout: name, email "
             "address, phone number, and — for shipped merchandise — a postal shipping address "
             "(United States and Canada).</li>"
             "<li><strong>Exhibitor / vendor details</strong> when you reserve a booth: business "
             "name, contact information, and the booth selected.</li>"
             "<li><strong>Messages</strong> you send through our contact, media, exhibitor, or "
             "support forms, and any inbound email you send us.</li>"
             "<li><strong>Technical data</strong> automatically collected for security and "
             "reliability, such as IP address, device/browser type, and pages viewed.</li>"
             "</ul>"
             "<p>We do <strong>not</strong> collect or store your full payment-card number. Card "
             "payments are processed entirely by Stripe on Stripe-hosted pages; we receive only a "
             "confirmation and a transaction reference.</p>"
             "<h3>How we use your information</h3>"
             "<ul>"
             "<li>To process and fulfil ticket, merchandise, and booth orders and send order "
             "confirmations and event communications.</li>"
             "<li>To provide customer support and respond to your inquiries.</li>"
             "<li>To send marketing or newsletter email <em>where you have opted in</em>; every "
             "marketing message includes an unsubscribe link.</li>"
             "<li>To operate, secure, and improve the site, and to prevent fraud and abuse.</li>"
             "<li>To comply with legal obligations.</li>"
             "</ul>"
             "<h3>Service providers we share data with</h3>"
             "<p>We share information only with vendors who help us run the event, each acting under "
             "contract:</p>"
             "<ul>"
             "<li><strong>Stripe</strong> &mdash; payment processing.</li>"
             "<li><strong>SendGrid (Twilio)</strong> &mdash; transactional and marketing email.</li>"
             "<li><strong>Cloudflare</strong> &mdash; content delivery and video streaming for the "
             "Virtual Con.</li>"
             "<li><strong>Google</strong> &mdash; embedded Maps and reCAPTCHA anti-abuse.</li>"
             "</ul>"
             "<p>We do not sell your personal information. We may disclose information if required by "
             "law or to protect our rights and the safety of attendees.</p>"
             "<h3>Cookies</h3>"
             "<p>We and our providers use cookies and similar technologies. See our "
             "<a href=\"/cookie-policy\">Cookie Notice</a> for details and choices.</p>"
             "<h3>Data retention</h3>"
             "<p>We keep order and contact records for as long as needed to fulfil your order, run "
             "the event, and meet tax, accounting, and legal requirements, then delete or anonymize "
             "them.</p>"
             "<h3>Your rights</h3>"
             "<p>Depending on where you live (including under the California Consumer Privacy Act / "
             "CPRA), you may have the right to access, correct, delete, or restrict use of your "
             "personal information, and to opt out of marketing. To make a request, contact us at "
             "[privacy@forthefansfest.com]. We will not discriminate against you for exercising "
             "these rights.</p>"
             "<h3>Children</h3>"
             "<p>The site is not directed to children under 13, and we do not knowingly collect "
             "their personal information.</p>"
             "<h3>Security</h3>"
             "<p>We use administrative and technical safeguards to protect your information, "
             "including encryption of sensitive settings and restricted administrative access. No "
             "method of transmission is perfectly secure.</p>"
             "<h3>Changes</h3>"
             "<p>We may update this policy and will revise the date above when we do.</p>"
             "<h3>Contact</h3>"
             f"<p>{ORG} &mdash; [privacy@forthefansfest.com]. Mailing address: "
             "777 Harrah's Blvd, Atlantic City, NJ 08401.</p>"),
        ],
        "Privacy Policy | For The Fans Fest",
        "How For The Fans Fest collects, uses, and protects your information.",
    ),
    (
        "terms", "Terms of Sale &amp; Use",
        [
            ("Terms of Sale &amp; Use",
             f"<p><em>Last updated: {EFFECTIVE}.</em></p>"
             f"<p>These Terms govern your purchase of tickets, merchandise, and exhibitor booths "
             f"from {ORG} and your use of our website and event. By purchasing or attending, you "
             "agree to these Terms.</p>"
             "<h3>Eligibility</h3>"
             "<p>You must be able to form a binding contract to purchase. Minors must be accompanied "
             "by a ticketed adult as required by venue rules.</p>"
             "<h3>Tickets &amp; admission</h3>"
             "<ul>"
             "<li>Prices are shown at checkout in U.S. dollars and are charged in full at purchase.</li>"
             "<li>All ticket sales are <strong>final and non-refundable</strong> unless the event is "
             "cancelled. Tickets are <strong>non-transferable once checked in</strong>.</li>"
             "<li>A ticket is a revocable license to attend. We may refuse entry or remove anyone who "
             "violates our policies, venue rules, or the law, without refund.</li>"
             "<li>Single-day, multi-day, and Digital passes grant only the access described for that "
             "pass type.</li>"
             "</ul>"
             "<h3>Payment</h3>"
             "<p>Payments are processed by Stripe on Stripe-hosted pages. We never receive or store "
             "your full card details. You authorize the charge shown at checkout.</p>"
             "<h3>Conduct, bags &amp; props</h3>"
             "<p>Attendance is subject to our <a href=\"/policies\">Policies</a>, including the code "
             "of conduct and the bag &amp; prop policy. Harassment is not tolerated. Bags and props "
             "are subject to inspection; functional weapons and realistic firearms are prohibited.</p>"
             "<h3>Photography &amp; likeness</h3>"
             "<p>The event may be photographed, filmed, and live-streamed. By attending you grant us "
             "a non-exclusive, royalty-free license to use your image and likeness as captured at the "
             "event for promotional purposes.</p>"
             "<h3>Digital / Virtual Con</h3>"
             "<p>Digital passes provide personal, non-commercial access to the livestream using your "
             "confirmation number. Recording, redistribution, or public performance of the stream is "
             "prohibited.</p>"
             "<h3>Intellectual property</h3>"
             "<p>All site content and event branding is owned by us or our licensors and may not be "
             "used without permission.</p>"
             "<h3>Disclaimers &amp; limitation of liability</h3>"
             "<p>The site and event are provided on an &ldquo;as is&rdquo; basis. To the fullest "
             "extent permitted by law, our total liability arising out of your purchase or attendance "
             "is limited to the amount you paid, and we are not liable for indirect or consequential "
             "damages. Nothing limits liability that cannot be limited by law.</p>"
             "<h3>Indemnification</h3>"
             "<p>You agree to indemnify and hold us harmless from claims arising out of your breach "
             "of these Terms or your conduct at the event.</p>"
             "<h3>Governing law</h3>"
             "<p>These Terms are governed by the laws of the State of New Jersey, and disputes will "
             "be resolved in the state or federal courts located in New Jersey.</p>"
             "<h3>Changes &amp; contact</h3>"
             f"<p>We may update these Terms and will revise the date above. Questions: "
             "[support@forthefansfest.com].</p>"),
        ],
        "Terms of Sale & Use | For The Fans Fest",
        "The terms governing ticket, merchandise, and booth purchases and event attendance.",
    ),
    (
        "refund-policy", "Refund &amp; Cancellation Policy",
        [
            ("Refund &amp; Cancellation Policy",
             f"<p><em>Last updated: {EFFECTIVE}.</em></p>"
             "<h3>Tickets</h3>"
             "<p>All ticket sales are <strong>final and non-refundable</strong> unless the event is "
             "cancelled. Tickets are <strong>non-transferable once checked in</strong>.</p>"
             "<h3>Event cancellation or postponement</h3>"
             "<p>If the event is cancelled, valid ticket holders will receive a refund of the ticket "
             "price to the original payment method. If the event is postponed or rescheduled, tickets "
             "will be honored for the new date; refund eligibility, if any, will be communicated at "
             "that time. We are not responsible for travel, lodging, or other incidental costs.</p>"
             "<h3>Merchandise</h3>"
             "<p>Physical merchandise may be returned within 30 days of delivery if unused and in "
             "original condition; shipping costs are non-refundable. Contact us to arrange a return.</p>"
             "<h3>Digital passes</h3>"
             "<p>Digital / Virtual Con passes are non-refundable once the confirmation number has "
             "been issued.</p>"
             "<h3>Exhibitor booths</h3>"
             "<p>Booth fees are non-refundable except where required by law or where the event is "
             "cancelled by us. See the <a href=\"/exhibitor-terms\">Exhibitor &amp; Booth Sale "
             "Terms</a>.</p>"
             "<h3>How to request a refund</h3>"
             "<p>Where a refund applies, email [support@forthefansfest.com] with your order number. "
             "Approved refunds are issued to the original payment method via Stripe. Please contact "
             "us before disputing a charge with your bank so we can resolve it directly.</p>"),
        ],
        "Refund & Cancellation Policy | For The Fans Fest",
        "When tickets, merchandise, digital passes, and booths can be refunded.",
    ),
    (
        "cookie-policy", "Cookie Notice",
        [
            ("Cookie Notice",
             f"<p><em>Last updated: {EFFECTIVE}.</em></p>"
             "<p>Cookies are small files stored on your device. We use them to keep the site working "
             "and secure and to understand how it is used.</p>"
             "<h3>Types of cookies we use</h3>"
             "<ul>"
             "<li><strong>Essential</strong> &mdash; needed for the cart, checkout, and signed-in "
             "admin sessions. The site will not function properly without these.</li>"
             "<li><strong>Security</strong> &mdash; Google reCAPTCHA helps us block bots and abuse on "
             "our forms.</li>"
             "<li><strong>Embedded content</strong> &mdash; Google Maps (venue map) and Stripe "
             "(checkout) may set their own cookies when those features load.</li>"
             "<li><strong>Functional</strong> &mdash; remember preferences such as light/dark theme.</li>"
             "</ul>"
             "<h3>Managing cookies</h3>"
             "<p>Most browsers let you block or delete cookies in their settings. Blocking essential "
             "cookies may break checkout and sign-in. For third-party cookies, see the privacy "
             "settings of Google and Stripe.</p>"
             "<h3>More information</h3>"
             "<p>See our <a href=\"/privacy-policy\">Privacy Policy</a>. We will revise the date above "
             "if this notice changes.</p>"),
        ],
        "Cookie Notice | For The Fans Fest",
        "The cookies For The Fans Fest uses and how to manage them.",
    ),
    (
        "exhibitor-terms", "Exhibitor &amp; Booth Sale Terms",
        [
            ("Exhibitor &amp; Booth Sale Terms",
             f"<p><em>Last updated: {EFFECTIVE}.</em></p>"
             f"<p>These terms govern the reservation and purchase of exhibitor booths at {ORG} "
             "(the &ldquo;Event&rdquo;). By reserving a booth you (the &ldquo;Exhibitor&rdquo;) agree "
             "to these terms in addition to our <a href=\"/terms\">Terms of Sale &amp; Use</a> and "
             "<a href=\"/policies\">Policies</a>.</p>"
             "<h3>Booth selection &amp; holds</h3>"
             "<p>Booths are selected from the interactive floor plan and priced by zone (for example, "
             "Artist Alley and Exhibitor Hall). When you select a booth we place a temporary "
             "<strong>hold</strong> on it so another exhibitor cannot buy it while you check out. The "
             "hold expires after a short window (15 minutes by default), after which the booth is "
             "automatically released and made available again if checkout is not completed.</p>"
             "<h3>Payment &amp; confirmation</h3>"
             "<p>Booth fees are payable in full at checkout through Stripe. <strong>A booth is "
             "confirmed and marked sold only after payment succeeds.</strong> Selecting a booth or "
             "holding it does not reserve it until payment is complete. Prices are shown on the floor "
             "plan in U.S. dollars.</p>"
             "<h3>Fees &amp; refunds</h3>"
             "<p>Booth fees are <strong>non-refundable</strong> except where the Event is cancelled by "
             "us or as required by law. Booth assignments are final.</p>"
             "<h3>Transfer &amp; subletting</h3>"
             "<p>Booths may not be transferred, shared, sublet, or resold without our prior written "
             "consent. The booth must be used by the Exhibitor named on the order.</p>"
             "<h3>Setup, staffing &amp; teardown</h3>"
             "<p>Exhibitors must set up, staff, and tear down their booth during the published show "
             "hours and follow all instructions of show staff, security, and the venue.</p>"
             "<h3>Conduct &amp; prohibited goods</h3>"
             "<p>Exhibitors must comply with our code of conduct and bag &amp; prop policy. The sale "
             "of counterfeit, infringing, illegal, or unsafe goods, and of functional weapons or "
             "realistic firearms, is prohibited. We may remove any Exhibitor in violation without "
             "refund.</p>"
             "<h3>Insurance, liability &amp; indemnification</h3>"
             "<p>Exhibitors are responsible for their own goods, displays, and personnel and are "
             "encouraged to carry their own insurance. To the fullest extent permitted by law, we are "
             "not liable for loss of or damage to Exhibitor property, and the Exhibitor agrees to "
             "indemnify and hold us and the venue harmless from claims arising out of the "
             "Exhibitor&rsquo;s participation.</p>"
             "<h3>Cancellation by organizer &amp; force majeure</h3>"
             "<p>We may cancel or reschedule the Event due to circumstances beyond our reasonable "
             "control. In the event of cancellation by us, booth fees will be refunded.</p>"
             "<h3>Governing law</h3>"
             "<p>These terms are governed by the laws of the State of New Jersey. Questions: "
             "[exhibitors@forthefansfest.com].</p>"),
        ],
        "Exhibitor & Booth Sale Terms | For The Fans Fest",
        "Terms for reserving and purchasing exhibitor booths at For The Fans Fest.",
    ),
]


def sql_str(s: str) -> str:
    return "'" + s.replace("'", "''") + "'"


def build_rows():
    rows = []
    for slug, title, blocks, seo_title, seo_desc in PAGES:
        block_arr = []
        html_parts = []
        for heading, html in blocks:
            block_arr.append({"type": "heading", "data": {"text": heading}})
            block_arr.append({"type": "richtext", "data": {"html": html}})
            html_parts.append(f"<h2>{heading}</h2>" + html)
        blocks_json = json.dumps(block_arr, ensure_ascii=False)
        body_html = "".join(html_parts)
        row = (
            f"  ({sql_str(slug)}, {sql_str(title)},\n"
            f"   {sql_str(blocks_json)}::jsonb,\n"
            f"   {sql_str(body_html)},\n"
            f"   {sql_str(seo_title)}, {sql_str(seo_desc)}, TRUE, now())"
        )
        rows.append(row)
    return rows


def main():
    rows = build_rows()
    block = (
        "\n-- ── legal / compliance pages (Privacy, Terms, Refunds, Cookies, "
        "Exhibitor) ──\n"
        "-- Drafts generated from site facts; have counsel review and fill the\n"
        "-- [bracketed] contact/entity placeholders before relying on them.\n"
        "INSERT INTO pages (slug, title, blocks, body_html, seo_title, seo_description, "
        "is_published, published_at) VALUES\n"
        + ",\n".join(rows)
        + "\nON CONFLICT (slug) DO UPDATE\n"
        "  SET title = EXCLUDED.title, blocks = EXCLUDED.blocks, body_html = EXCLUDED.body_html,\n"
        "      seo_title = EXCLUDED.seo_title, seo_description = EXCLUDED.seo_description,\n"
        "      is_published = TRUE, published_at = COALESCE(pages.published_at, now());\n"
    )

    with open(SEED, "r", encoding="utf-8") as f:
        content = f.read()

    marker = "-- ── booths (default vendor floor inventory"
    idx = content.index(marker)
    new_content = content[:idx] + block.lstrip("\n") + "\n" + content[idx:]
    with open(SEED, "w", encoding="utf-8") as f:
        f.write(new_content)
    print("spliced", len(rows), "pages into", SEED)


if __name__ == "__main__":
    main()
