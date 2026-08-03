import { Router } from 'express';
import { z } from 'zod';
import { query, withTransaction } from '../db/pool.js';
import { asyncHandler, notFound, badRequest, HttpError } from '../lib/http.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { audit } from '../lib/audit.js';
import { fulfillExhibitorSession } from '../lib/fulfillment.js';
import { sendBalanceInvoice } from '../lib/exhibitorBalance.js';
import { sendExhibitorPaymentConfirmation, sendExhibitorPaymentRequest, sendExhibitorComplimentary } from '../lib/email.js';
import { release as releaseInventory, uncommit as uncommitInventory } from '../lib/inventory.js';
import { getStripe } from '../lib/stripe.js';
import { getSettingValue } from '../lib/settings.js';
import { env } from '../config/env.js';

// Admin: Become an Exhibitor management (§9 extended). View applications,
// confirm check payments, send balance invoices, and manage table inventory.
export const adminExhibitorsRouter = Router();
adminExhibitorsRouter.use(requireAuth, requireRole('admin', 'editor'));

// ── inventory pools ──────────────────────────────────────────────────────────
adminExhibitorsRouter.get(
  '/inventory',
  asyncHandler(async (_req, res) => {
    const { rows } = await query(`SELECT * FROM inventory_pools ORDER BY key`);
    res.json({ pools: rows.map((p) => ({ ...p, available: p.total - p.reserved - p.sold })) });
  }),
);

adminExhibitorsRouter.put(
  '/inventory/:key',
  asyncHandler(async (req, res) => {
    const total = z.coerce.number().int().min(0).max(100000).parse(req.body?.total);
    const { rows } = await query(
      `UPDATE inventory_pools SET total=$2 WHERE key=$1 RETURNING *`,
      [req.params.key, total],
    );
    if (!rows[0]) throw notFound('Inventory pool not found');
    await audit(req.user.id, 'inventory.update', { entity: 'inventory', entityId: req.params.key, meta: { total } });
    const p = rows[0];
    res.json({ pool: { ...p, available: p.total - p.reserved - p.sold } });
  }),
);

// ── applications ─────────────────────────────────────────────────────────────
adminExhibitorsRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    const { rows } = await query(
      `SELECT a.*, b.label AS booth_label,
              (SELECT array_agg(label ORDER BY label) FROM booths WHERE id = ANY(a.booth_ids)) AS booth_labels
         FROM exhibitor_applications a
         LEFT JOIN booths b ON b.id = a.booth_id
        WHERE a.status <> 'draft'
        ORDER BY a.created_at DESC`,
    );
    res.json({ applications: rows });
  }),
);

adminExhibitorsRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const { rows } = await query(
      `SELECT a.*, b.label AS booth_label, b.zone AS booth_zone,
              (SELECT array_agg(label ORDER BY label) FROM booths WHERE id = ANY(a.booth_ids)) AS booth_labels
         FROM exhibitor_applications a
         LEFT JOIN booths b ON b.id = a.booth_id
        WHERE a.id = $1`,
      [req.params.id],
    );
    if (!rows[0]) throw notFound('Application not found');
    res.json({ application: rows[0] });
  }),
);

// POST /:id/send-balance — create a balance Stripe session + email the vendor.
adminExhibitorsRouter.post(
  '/:id/send-balance',
  asyncHandler(async (req, res) => {
    const { rows } = await query(`SELECT * FROM exhibitor_applications WHERE id=$1`, [req.params.id]);
    const app = rows[0];
    if (!app) throw notFound('Application not found');
    try {
      const { url } = await sendBalanceInvoice(app);
      await audit(req.user.id, 'exhibitor.balance_requested', { entity: 'exhibitor', entityId: app.id });
      res.json({ ok: true, url });
    } catch (err) {
      if (err.code === 'no_balance') throw badRequest(err.message, 'no_balance');
      throw err;
    }
  }),
);

// POST /:id/mark-paid — record a check payment. Phase is inferred: the first
// payment settles the chosen deposit/full; a later one settles the balance.
adminExhibitorsRouter.post(
  '/:id/mark-paid',
  asyncHandler(async (req, res) => {
    const { rows } = await query(`SELECT * FROM exhibitor_applications WHERE id=$1`, [req.params.id]);
    const app = rows[0];
    if (!app) throw notFound('Application not found');

    let phase;
    let amountCents;
    if (app.status === 'check_pending' || app.status === 'awaiting_payment') {
      phase = app.payment_choice === 'full' ? 'full' : 'deposit';
      amountCents = phase === 'full' ? app.total_cents : app.deposit_cents;
    } else if (app.status === 'deposit_paid' && app.balance_cents > 0) {
      phase = 'balance';
      amountCents = app.balance_cents;
    } else {
      throw new HttpError(409, 'Nothing outstanding to mark paid.', 'nothing_due');
    }

    // Reuse the webhook fulfillment path with a synthetic session.
    const result = await fulfillExhibitorSession({
      metadata: { application_id: app.id, phase },
      amount_total: amountCents,
    });
    if (result?.application && !result.alreadyPaid) {
      await sendExhibitorPaymentConfirmation(result.application, phase).catch(() => {});
    }
    await audit(req.user.id, 'exhibitor.check_marked_paid', { entity: 'exhibitor', entityId: app.id, meta: { phase } });
    res.json({ ok: true, application: result.application });
  }),
);

// POST /:id/cancel — release a held booth + reserved tables for an unpaid app.
adminExhibitorsRouter.post(
  '/:id/cancel',
  asyncHandler(async (req, res) => {
    const { rows } = await query(`SELECT * FROM exhibitor_applications WHERE id=$1`, [req.params.id]);
    const app = rows[0];
    if (!app) throw notFound('Application not found');
    if (['paid_in_full'].includes(app.status)) throw badRequest('Cannot cancel a fully paid application.');
    if (app.reserved_tables > 0 && app.status !== 'deposit_paid') {
      await releaseInventory('extra_tables', app.reserved_tables);
    }
    await withTransaction(async (client) => {
      // Release the legacy single booth and the multi-table holds/locks.
      if (app.booth_id && app.status !== 'deposit_paid') {
        await client.query(`UPDATE booths SET status='available', held_until=NULL WHERE id=$1 AND status<>'sold'`, [app.booth_id]);
      }
      if ((app.booth_ids || []).length) {
        await client.query(`UPDATE booths SET status='available', held_until=NULL, order_id=NULL WHERE id = ANY($1)`, [app.booth_ids]);
      }
      // Remove from the public directory if it was listed.
      await client.query(`DELETE FROM vendors WHERE application_id=$1`, [app.id]);
      await client.query(`UPDATE exhibitor_applications SET status='cancelled', is_listed=FALSE WHERE id=$1`, [app.id]);
    });
    await audit(req.user.id, 'exhibitor.cancel', { entity: 'exhibitor', entityId: app.id });
    res.json({ ok: true });
  }),
);

// Generate the deposit + full Stripe Checkout links, record them on the app, and
// email the vendor the payment request. Shared by approve (sent automatically)
// and the manual resend. Errors propagate so the admin sees a real failure
// instead of a silent success.
async function generateAndSendPaymentRequest(app) {
  const stripe = await getStripe();
  const currency = (await getSettingValue('stripe.currency')) || 'usd';
  const mkSession = (phase, amount, label) => stripe.checkout.sessions.create({
    mode: 'payment',
    customer_email: app.contact_email,
    line_items: [{ quantity: 1, price_data: { currency, unit_amount: amount, product_data: { name: `${label} — ${app.vendor_name} (${app.reference})` } } }],
    metadata: { kind: 'exhibitor', application_id: app.id, reference: app.reference, phase },
    // Copy onto the PaymentIntent too so refunds can find the charge by metadata.
    payment_intent_data: { metadata: { kind: 'exhibitor', application_id: app.id, reference: app.reference, phase } },
    success_url: `${env.CLIENT_ORIGIN}/become-an-exhibitor/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${env.CLIENT_ORIGIN}/`,
  });
  const deposit = await mkSession('deposit', app.deposit_cents, 'Exhibitor deposit');
  const full = await mkSession('full', app.total_cents, 'Exhibitor payment (full)');
  await query(
    `UPDATE exhibitor_applications SET status='awaiting_payment', stripe_session_id=$2,
            payment_request_sent_at=now() WHERE id=$1`,
    [app.id, deposit.id],
  );
  await sendExhibitorPaymentRequest(app, { depositUrl: deposit.url, fullUrl: full.url });
}

// POST /:id/refund — refund EVERY Stripe charge on the application (deposit +
// balance if they paid in installments, or a single full payment), then release
// their space and de-list them. Marks the application 'refunded'.
adminExhibitorsRouter.post(
  '/:id/refund',
  asyncHandler(async (req, res) => {
    const { rows } = await query(`SELECT * FROM exhibitor_applications WHERE id=$1`, [req.params.id]);
    const app = rows[0];
    if (!app) throw notFound('Application not found');
    if (!['deposit_paid', 'paid_in_full'].includes(app.status)) {
      throw badRequest('Only a paid application can be refunded.', 'not_refundable');
    }
    const stripe = await getStripe();

    // Gather every succeeded PaymentIntent for this application. Split payments
    // record both the deposit session and the balance session; on-site payments
    // carry application_id metadata. Dedupe across both sources.
    const piIds = new Set();
    for (const sid of [app.stripe_session_id, app.balance_session_id].filter(Boolean)) {
      try {
        const s = await stripe.checkout.sessions.retrieve(sid);
        if (s.payment_status === 'paid' && s.payment_intent) {
          piIds.add(typeof s.payment_intent === 'string' ? s.payment_intent : s.payment_intent.id);
        }
      } catch { /* stale/invalid session id — skip */ }
    }
    try {
      const found = await stripe.paymentIntents.search({
        query: `metadata['application_id']:'${app.id}' AND status:'succeeded'`, limit: 100,
      });
      for (const pi of found.data) piIds.add(pi.id);
    } catch { /* search unavailable — the sessions above still cover Checkout payments */ }

    if (piIds.size === 0) {
      throw badRequest('No Stripe charges found for this application (paid by check, or an older record). Refund manually in Stripe if needed.', 'no_charges');
    }

    let refundedCents = 0;
    const refunds = [];
    for (const pi of piIds) {
      try {
        const r = await stripe.refunds.create({ payment_intent: pi });
        refundedCents += r.amount || 0;
        refunds.push({ paymentIntent: pi, status: r.status, amount: r.amount });
      } catch (e) {
        if (e?.code === 'charge_already_refunded') { refunds.push({ paymentIntent: pi, status: 'already_refunded' }); continue; }
        throw badRequest(`Refund failed for ${pi}: ${e.message}`, 'refund_failed');
      }
    }

    // Free the space, de-list, and mark refunded.
    const boothIds = app.booth_ids || [];
    await withTransaction(async (client) => {
      if (boothIds.length) await client.query(`UPDATE booths SET status='available', held_until=NULL, order_id=NULL WHERE id = ANY($1)`, [boothIds]);
      if (app.booth_id) await client.query(`UPDATE booths SET status='available', held_until=NULL WHERE id=$1 AND status<>'available'`, [app.booth_id]);
      if (app.reserved_tables > 0) await uncommitInventory('extra_tables', app.reserved_tables, client);
      await client.query(`DELETE FROM vendors WHERE application_id=$1`, [app.id]);
      await client.query(`UPDATE exhibitor_applications SET status='refunded', is_listed=FALSE WHERE id=$1`, [app.id]);
    });

    await audit(req.user.id, 'exhibitor.refund', { entity: 'exhibitor', entityId: app.id, meta: { refundedCents, count: refunds.length } });
    res.json({ ok: true, refundedCents, refunds });
  }),
);

// POST /:id/approve — approve a pending application AND immediately generate +
// email the payment request (deposit/full pay links). Tables stay held;
// lock-&-list is still a separate later step.
adminExhibitorsRouter.post(
  '/:id/approve',
  asyncHandler(async (req, res) => {
    const { rows } = await query(`SELECT * FROM exhibitor_applications WHERE id=$1`, [req.params.id]);
    const app = rows[0];
    if (!app) throw notFound('Application not found');
    if (app.status !== 'pending_approval') throw badRequest('Only pending applications can be approved.');
    await query(
      `UPDATE exhibitor_applications SET status='approved', approved_at=now(),
              approval_notice_sent_at=now() WHERE id=$1`,
      [app.id],
    );
    // Generate the Stripe pay links and email them now (sets status=awaiting_payment).
    const fresh = (await query(`SELECT * FROM exhibitor_applications WHERE id=$1`, [app.id])).rows[0];
    await generateAndSendPaymentRequest(fresh);
    const updated = (await query(`SELECT * FROM exhibitor_applications WHERE id=$1`, [app.id])).rows[0];
    await audit(req.user.id, 'exhibitor.approve', { entity: 'exhibitor', entityId: app.id });
    res.json({ ok: true, application: updated });
  }),
);

// POST /:id/comp — confirm an exhibitor with NO payment (complimentary). Marks
// the application paid-in-full at $0 (commits held tables + marks the booth
// sold, same as a real payment) and emails a confirmation. Lock-&-list stays a
// separate step, just like a paid vendor.
adminExhibitorsRouter.post(
  '/:id/comp',
  asyncHandler(async (req, res) => {
    const { rows } = await query(`SELECT * FROM exhibitor_applications WHERE id=$1`, [req.params.id]);
    const app = rows[0];
    if (!app) throw notFound('Application not found');
    if (!['pending_approval', 'approved', 'awaiting_payment', 'check_pending'].includes(app.status)) {
      throw badRequest('This application can’t be comped (already paid or closed).', 'not_compable');
    }
    await query(
      `UPDATE exhibitor_applications
          SET approved_at = COALESCE(approved_at, now()),
              approval_notice_sent_at = COALESCE(approval_notice_sent_at, now())
        WHERE id=$1`,
      [app.id],
    );
    // Reuse the normal paid path at $0: marks paid_in_full, commits tables/booth.
    const result = await fulfillExhibitorSession({
      metadata: { application_id: app.id, phase: 'full' },
      amount_total: 0,
    });
    const finalApp = result?.application || app;
    await sendExhibitorComplimentary(finalApp).catch((e) => console.error('Comp email failed:', e.message));
    await audit(req.user.id, 'exhibitor.comp', { entity: 'exhibitor', entityId: app.id });
    res.json({ ok: true, application: finalApp });
  }),
);

// POST /:id/request-payment — (re)generate + email the deposit/full pay links.
adminExhibitorsRouter.post(
  '/:id/request-payment',
  asyncHandler(async (req, res) => {
    const { rows } = await query(`SELECT * FROM exhibitor_applications WHERE id=$1`, [req.params.id]);
    const app = rows[0];
    if (!app) throw notFound('Application not found');
    if (!['approved', 'awaiting_payment', 'check_pending'].includes(app.status)) {
      throw badRequest('Approve the application before requesting payment.', 'not_approved');
    }
    await generateAndSendPaymentRequest(app);
    await audit(req.user.id, 'exhibitor.payment_requested', { entity: 'exhibitor', entityId: app.id });
    res.json({ ok: true });
  }),
);

// POST /:id/list — lock the held tables as SOLD and publish the vendor to the
// public directory. Separate from payment; idempotent.
adminExhibitorsRouter.post(
  '/:id/list',
  asyncHandler(async (req, res) => {
    const { rows } = await query(`SELECT * FROM exhibitor_applications WHERE id=$1`, [req.params.id]);
    const app = rows[0];
    if (!app) throw notFound('Application not found');
    if (!['approved', 'awaiting_payment', 'check_pending', 'deposit_paid', 'paid_in_full'].includes(app.status)) {
      throw badRequest('Approve the application before locking & listing.', 'not_approved');
    }
    const boothIds = app.booth_ids || [];
    const vendor = await withTransaction(async (client) => {
      let labels = [];
      if (boothIds.length) {
        const r = await client.query(
          `UPDATE booths SET status='sold', held_until=NULL WHERE id = ANY($1) RETURNING label`,
          [boothIds],
        );
        labels = r.rows.map((x) => x.label.toUpperCase()).sort();
      }
      await client.query(
        `UPDATE exhibitor_applications SET is_listed=TRUE, listed_at=now() WHERE id=$1`,
        [app.id],
      );
      const v = await client.query(
        `INSERT INTO vendors (name, booth_number, category, website, application_id, is_active)
         SELECT $1,$2,$3,$4,$5,TRUE
          WHERE NOT EXISTS (SELECT 1 FROM vendors WHERE application_id=$5)
         RETURNING *`,
        [app.vendor_name, labels.join(', ') || null, app.category ?? null, app.website ?? null, app.id],
      );
      return v.rows[0] || null;
    });
    await audit(req.user.id, 'exhibitor.listed', { entity: 'exhibitor', entityId: app.id });
    res.json({ ok: true, vendor });
  }),
);

// POST /:id/reject — reject a pending application: release its held tables.
adminExhibitorsRouter.post(
  '/:id/reject',
  asyncHandler(async (req, res) => {
    const { rows } = await query(`SELECT * FROM exhibitor_applications WHERE id=$1`, [req.params.id]);
    const app = rows[0];
    if (!app) throw notFound('Application not found');
    if (app.status !== 'pending_approval') throw badRequest('Only pending applications can be rejected.');
    const boothIds = app.booth_ids || [];

    await withTransaction(async (client) => {
      if (boothIds.length) {
        await client.query(
          `UPDATE booths SET status='available', held_until=NULL WHERE id = ANY($1) AND status='held'`,
          [boothIds],
        );
      }
      await client.query(
        `UPDATE exhibitor_applications SET status='rejected', rejected_at=now() WHERE id=$1`,
        [app.id],
      );
    });

    await audit(req.user.id, 'exhibitor.reject', { entity: 'exhibitor', entityId: app.id });
    res.json({ ok: true });
  }),
);
