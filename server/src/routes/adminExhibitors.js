import { Router } from 'express';
import { z } from 'zod';
import { query } from '../db/pool.js';
import { asyncHandler, notFound, badRequest, HttpError } from '../lib/http.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { audit } from '../lib/audit.js';
import { fulfillExhibitorSession } from '../lib/fulfillment.js';
import { sendBalanceInvoice } from '../lib/exhibitorBalance.js';
import { sendExhibitorPaymentConfirmation } from '../lib/email.js';
import { release as releaseInventory } from '../lib/inventory.js';

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
      `SELECT a.*, b.label AS booth_label
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
      `SELECT a.*, b.label AS booth_label, b.zone AS booth_zone
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
    if (app.booth_id && app.status !== 'deposit_paid') {
      await query(`UPDATE booths SET status='available', held_until=NULL WHERE id=$1 AND status<>'sold'`, [app.booth_id]);
    }
    await query(`UPDATE exhibitor_applications SET status='cancelled' WHERE id=$1`, [app.id]);
    await audit(req.user.id, 'exhibitor.cancel', { entity: 'exhibitor', entityId: app.id });
    res.json({ ok: true });
  }),
);
