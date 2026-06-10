import { Router } from 'express';
import { z } from 'zod';
import { query, withTransaction } from '../db/pool.js';
import { env } from '../config/env.js';
import { asyncHandler, badRequest, notFound, HttpError } from '../lib/http.js';
import { formLimiter } from '../middleware/rateLimit.js';
import { requireRecaptcha } from '../middleware/recaptcha.js';
import { randomToken } from '../lib/crypto.js';
import { getStripe } from '../lib/stripe.js';
import { getSettingValue } from '../lib/settings.js';
import { PRICES, computeExhibitorPricing } from '../lib/exhibitorPricing.js';
import { getPool, reserve, release as releaseInventory } from '../lib/inventory.js';
import { sendExhibitorCheckReceived, notifyAdminOfExhibitor } from '../lib/email.js';

// Become an Exhibitor (§9 extended). A vendor fills the application + agrees to
// the terms, then proceeds to pick a booth and pay (deposit or full) by card or
// by check. Pricing is recomputed server-side; tables are oversell-safe.
export const exhibitorRouter = Router();

const TABLE_POOL = 'extra_tables';

function reference() {
  return `EX-${Date.now().toString(36).toUpperCase()}-${randomToken(2).toUpperCase()}`;
}

// GET /exhibitor/past — public directory of prior-year exhibitors (company,
// stand, category). Empty until populated; the page handles the empty state.
exhibitorRouter.get(
  '/past',
  asyncHandler(async (_req, res) => {
    const { rows } = await query(
      `SELECT company, stand, category, year, website
         FROM past_exhibitors WHERE is_active = TRUE
        ORDER BY company ASC`,
    );
    res.json({ exhibitors: rows });
  }),
);

// GET /exhibitor/config — prices + remaining table inventory (for the live form).
exhibitorRouter.get(
  '/config',
  asyncHandler(async (_req, res) => {
    const pool = await getPool(TABLE_POOL);
    res.json({
      prices: PRICES,
      tablesAvailable: pool ? pool.available : 0,
    });
  }),
);

const applySchema = z.object({
  vendor_name: z.string().min(1).max(200),
  product_desc: z.string().max(2000).optional().nullable(),
  num_attendees: z.coerce.number().int().min(0).max(100).optional().nullable(),
  company_name: z.string().max(200).optional().nullable(),
  address: z.string().max(400).optional().nullable(),
  contact_name: z.string().max(200).optional().nullable(),
  contact_email: z.string().email(),
  contact_phone: z.string().max(40).optional().nullable(),
  website: z.string().max(300).optional().nullable(),
  category: z.string().max(200).optional().nullable(),
  hotel_night1: z.boolean().optional(),
  hotel_night2: z.boolean().optional(),
  hotel_night3: z.boolean().optional(),
  extra_tables: z.coerce.number().int().min(0).max(50).optional(),
  additional_request: z.string().max(2000).optional().nullable(),
  livestreaming: z.boolean().optional(),
  livestream_panel: z.boolean().optional(),
  panel_name: z.string().max(200).optional().nullable(),
  panel_day: z.string().max(60).optional().nullable(),
  banquet: z.boolean().optional(),
  banquet_chicken: z.coerce.number().int().min(0).max(100).optional(),
  banquet_beef: z.coerce.number().int().min(0).max(100).optional(),
  banquet_vegan: z.coerce.number().int().min(0).max(100).optional(),
  dietary: z.string().max(1000).optional().nullable(),
  signature: z.string().min(2).max(200),
  agreed: z.literal(true),
});

// POST /exhibitor/apply — persist the application + pricing snapshot.
exhibitorRouter.post(
  '/apply',
  formLimiter,
  requireRecaptcha,
  asyncHandler(async (req, res) => {
    const d = applySchema.parse(req.body);
    const pricing = computeExhibitorPricing(d);

    // Don't accept more tables than could ever exist (hard cap; the real
    // reservation happens atomically at checkout).
    const pool = await getPool(TABLE_POOL);
    if (pricing.extraTables > 0 && (!pool || pricing.extraTables > pool.total)) {
      throw badRequest(`Only ${pool ? pool.total : 0} additional tables are offered.`, 'tables_exceeded');
    }

    const { rows } = await query(
      `INSERT INTO exhibitor_applications (
         reference, vendor_name, product_desc, num_attendees, company_name, address,
         contact_name, contact_email, contact_phone, website, category,
         hotel_night1, hotel_night2, hotel_night3, extra_tables, additional_request,
         livestreaming, livestream_panel, panel_name, panel_day,
         banquet, banquet_chicken, banquet_beef, banquet_vegan, dietary,
         signature, agreed_at, total_cents, deposit_cents, balance_cents, breakdown, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,
               $21,$22,$23,$24,$25,$26, now(), $27,$28,$29,$30,'draft')
       RETURNING id, reference, total_cents, deposit_cents, balance_cents`,
      [
        reference(), d.vendor_name, d.product_desc ?? null, d.num_attendees ?? null,
        d.company_name ?? null, d.address ?? null, d.contact_name ?? null, d.contact_email,
        d.contact_phone ?? null, d.website ?? null, d.category ?? null,
        !!d.hotel_night1, !!d.hotel_night2, !!d.hotel_night3, pricing.extraTables,
        d.additional_request ?? null, !!d.livestreaming, !!d.livestream_panel,
        d.panel_name ?? null, d.panel_day ?? null, !!d.banquet,
        d.banquet_chicken ?? 0, d.banquet_beef ?? 0, d.banquet_vegan ?? 0, d.dietary ?? null,
        d.signature, pricing.totalCents, pricing.depositCents, pricing.balanceCents,
        JSON.stringify(pricing.lineItems),
      ],
    );
    const app = rows[0];
    res.status(201).json({
      applicationId: app.id,
      reference: app.reference,
      totalCents: app.total_cents,
      depositCents: app.deposit_cents,
      balanceCents: app.balance_cents,
      breakdown: pricing.lineItems,
    });
  }),
);

const checkoutSchema = z.object({
  applicationId: z.string().uuid(),
  boothId: z.string().uuid(),
  choice: z.enum(['deposit', 'full']),
  method: z.enum(['card', 'check']),
});

// POST /exhibitor/checkout — reserve a booth + tables, then pay (card) or hold
// for a check. Booth + table reservations are atomic so nothing is oversold.
exhibitorRouter.post(
  '/checkout',
  formLimiter,
  asyncHandler(async (req, res) => {
    const { applicationId, boothId, choice, method } = checkoutSchema.parse(req.body);

    const currency = (await getSettingValue('stripe.currency')) || 'usd';
    // Card needs Stripe configured before we reserve anything.
    let stripe = null;
    if (method === 'card') stripe = await getStripe();

    const holdMs = method === 'card' ? 30 * 60_000 : 30 * 24 * 60_000 * 60; // 30 min card / 30 days check
    const holdUntil = new Date(Date.now() + holdMs);

    // Atomically claim the booth + reserve the extra tables. The application row
    // is locked FOR UPDATE so concurrent/repeat checkouts for the same
    // application serialize: the paid-status check can't go stale, and a repeat
    // checkout (retry, or picking a different booth) returns its previous booth
    // hold + table reservation before claiming anew instead of leaking them.
    // If tables run out, the whole transaction rolls back — no overselling.
    const { app, booth, amountCents } = await withTransaction(async (client) => {
      const { rows: appRows } = await client.query(
        `SELECT * FROM exhibitor_applications WHERE id = $1 FOR UPDATE`,
        [applicationId],
      );
      const app = appRows[0];
      if (!app) throw notFound('Application not found');
      if (['deposit_paid', 'paid_in_full'].includes(app.status)) {
        throw new HttpError(409, 'This application has already been paid.', 'already_paid');
      }

      const amountCents = choice === 'deposit' ? app.deposit_cents : app.total_cents;
      if (amountCents <= 0) throw badRequest('Nothing to charge for this application.');

      // Returning to checkout: release what THIS application holds. Guarded by
      // status so a cancelled app's stale booth_id can't release someone else's
      // hold.
      if (['awaiting_payment', 'check_pending'].includes(app.status)) {
        if (app.booth_id) {
          await client.query(
            `UPDATE booths SET status='available', held_until=NULL WHERE id=$1 AND status='held'`,
            [app.booth_id],
          );
        }
        if (app.reserved_tables > 0) {
          await releaseInventory(TABLE_POOL, app.reserved_tables, client);
        }
      }

      const claim = await client.query(
        `UPDATE booths SET status='held', held_until=$2
          WHERE id=$1 AND status='available'
          RETURNING id, label, zone, price_cents`,
        [boothId, holdUntil],
      );
      if (claim.rowCount === 0) {
        throw new HttpError(409, 'That booth is no longer available.', 'booth_unavailable');
      }
      if (app.extra_tables > 0) {
        const ok = await reserve(TABLE_POOL, app.extra_tables, client);
        if (!ok) {
          throw new HttpError(409, 'Not enough additional tables remain for your order.', 'tables_unavailable');
        }
      }
      await client.query(
        `UPDATE exhibitor_applications
            SET booth_id=$2, reserved_tables=$3, payment_method=$4, payment_choice=$5,
                hold_until=$6, status=$7
          WHERE id=$1`,
        [applicationId, boothId, app.extra_tables, method, choice, holdUntil,
          method === 'check' ? 'check_pending' : 'awaiting_payment'],
      );
      return { app, booth: claim.rows[0], amountCents };
    });

    if (method === 'check') {
      notifyAdminOfExhibitor(app, { choice, method, booth }).catch(() => {});
      sendExhibitorCheckReceived(app, { choice, booth, amountCents }).catch(() => {});
      return res.json({ ok: true, method: 'check', reference: app.reference });
    }

    // Card → on-site Payment Element. Create a PaymentIntent for the chosen
    // amount; the branded Payment Element collects payment on our page.
    const phaseLabel = choice === 'deposit' ? 'Deposit' : 'Full payment';
    const intent = await stripe.paymentIntents.create({
      amount: amountCents,
      currency,
      automatic_payment_methods: { enabled: true },
      receipt_email: app.contact_email,
      description: `Exhibitor ${phaseLabel} — ${app.vendor_name} (Booth ${booth.label})`,
      metadata: {
        kind: 'exhibitor',
        application_id: app.id,
        reference: app.reference,
        phase: choice, // 'deposit' | 'full'
        booth_id: boothId,
      },
    });
    // Reuse stripe_session_id to store the PaymentIntent id (our lookup key for
    // the confirmation page).
    await query(`UPDATE exhibitor_applications SET stripe_session_id=$2 WHERE id=$1`, [app.id, intent.id]);
    res.json({ clientSecret: intent.client_secret, method: 'card', reference: app.reference, amountCents });
  }),
);

// GET /exhibitor/session/:id — post-redirect status for the success page.
exhibitorRouter.get(
  '/session/:sessionId',
  asyncHandler(async (req, res) => {
    const { rows } = await query(
      `SELECT reference, status, total_cents, deposit_cents, balance_cents, amount_paid_cents, payment_choice
         FROM exhibitor_applications
        WHERE stripe_session_id = $1 OR balance_session_id = $1`,
      [req.params.sessionId],
    );
    const a = rows[0];
    if (!a) throw notFound('Application not found');
    res.json({ application: a });
  }),
);
