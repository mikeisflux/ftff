import express from 'express';
import { query } from '../db/pool.js';
import { getStripe } from '../lib/stripe.js';
import { getSettingValue } from '../lib/settings.js';
import { fulfillCheckoutSession } from '../lib/fulfillment.js';
import { sendTicketDelivery } from '../lib/email.js';

// Stripe webhook (§15, §4.3). MUST receive the raw body for signature
// verification, so this router is mounted BEFORE the global JSON parser.
// Unsigned/invalid events are rejected; replayed events are deduped by id.
export const webhookRouter = express.Router();

webhookRouter.post(
  '/stripe',
  express.raw({ type: 'application/json' }),
  async (req, res) => {
    const signingSecret = await getSettingValue('stripe.webhook_secret');
    const sig = req.get('stripe-signature');
    if (!signingSecret) return res.status(503).send('Webhook not configured');

    let event;
    try {
      const stripe = await getStripe();
      event = stripe.webhooks.constructEvent(req.body, sig, signingSecret);
    } catch (err) {
      // Bad signature / replay-protection failure.
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    // Idempotency: record the event id first; a duplicate is acknowledged and
    // skipped (event-ID dedupe, §4.3).
    const dedupe = await query(
      `INSERT INTO webhook_events (id, provider) VALUES ($1, 'stripe')
       ON CONFLICT (id) DO NOTHING RETURNING id`,
      [event.id],
    );
    if (dedupe.rowCount === 0) {
      return res.json({ received: true, duplicate: true });
    }

    try {
      switch (event.type) {
        case 'checkout.session.completed':
        case 'checkout.session.async_payment_succeeded': {
          const result = await fulfillCheckoutSession(event.data.object);
          // Deliver tickets by email AFTER the fulfillment transaction commits.
          // Non-fatal: an email failure must not fail the webhook (tickets are
          // already issued and visible on the confirmation page).
          if (result?.order && !result.alreadyPaid && result.issued?.length) {
            await sendTicketDelivery(result.order).catch((err) =>
              // eslint-disable-next-line no-console
              console.error('Ticket delivery email failed:', err.message),
            );
          }
          break;
        }
        default:
          break; // ignore unhandled event types
      }
    } catch (err) {
      // Let Stripe retry; remove the dedupe marker so the retry is processed.
      await query(`DELETE FROM webhook_events WHERE id = $1`, [event.id]).catch(() => {});
      // eslint-disable-next-line no-console
      console.error('Webhook handler error:', err.message);
      return res.status(500).send('Handler error');
    }

    res.json({ received: true });
  },
);
