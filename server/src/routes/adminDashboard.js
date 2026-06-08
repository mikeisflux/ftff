import { Router } from 'express';
import { query } from '../db/pool.js';
import { asyncHandler } from '../lib/http.js';
import { requireAuth, requireRole } from '../middleware/auth.js';

// Admin dashboard summary (§13): sales totals, tickets, check-ins, booths,
// store revenue, recent submissions.
export const adminDashboardRouter = Router();

adminDashboardRouter.use(requireAuth, requireRole('admin', 'editor'));

adminDashboardRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    const revenue = (
      await query(
        `SELECT coalesce(sum(total_cents),0)::bigint AS gross_cents,
                count(*)::int AS paid_orders,
                coalesce(sum(total_cents) FILTER (WHERE kind='ticket'),0)::bigint AS ticket_cents,
                coalesce(sum(total_cents) FILTER (WHERE kind='store'),0)::bigint AS store_cents,
                coalesce(sum(total_cents) FILTER (WHERE kind='vendor'),0)::bigint AS vendor_cents
           FROM orders WHERE status = 'paid'`,
      )
    ).rows[0];

    const tickets = (
      await query(
        `SELECT count(*)::int AS issued,
                count(*) FILTER (WHERE status='checked_in')::int AS checked_in
           FROM tickets`,
      )
    ).rows[0];

    const booths = (
      await query(
        `SELECT count(*) FILTER (WHERE status='sold')::int AS sold,
                count(*) FILTER (WHERE status='available')::int AS available
           FROM booths`,
      )
    ).rows[0];

    const submissions = (
      await query(`SELECT count(*) FILTER (WHERE NOT is_read)::int AS unread FROM contact_messages`)
    ).rows[0];

    const newsletter = (
      await query(`SELECT count(*)::int AS subscribers FROM newsletter_subscribers WHERE status='subscribed'`)
    ).rows[0];

    res.json({
      revenue: {
        grossCents: Number(revenue.gross_cents),
        paidOrders: revenue.paid_orders,
        ticketCents: Number(revenue.ticket_cents),
        storeCents: Number(revenue.store_cents),
        vendorCents: Number(revenue.vendor_cents),
      },
      tickets,
      booths,
      submissions,
      newsletter,
    });
  }),
);
