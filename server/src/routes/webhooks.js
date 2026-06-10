import express from 'express';
import { query } from '../db/pool.js';
import { getStripe } from '../lib/stripe.js';
import { getSettingValue } from '../lib/settings.js';
import { fulfillCheckoutSession, fulfillExhibitorSession } from '../lib/fulfillment.js';
import { sendTicketDelivery, sendBoothConfirmation, sendOrderConfirmation, sendExhibitorPaymentConfirmation } from '../lib/email.js';

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
          const session = event.data.object;
          // Exhibitor (Become an Exhibitor) sessions are tracked separately from
          // the orders table — route them to their own fulfillment.
          if (session.metadata?.kind === 'exhibitor') {
            const exh = await fulfillExhibitorSession(session);
            if (exh?.application && !exh.alreadyPaid) {
              await sendExhibitorPaymentConfirmation(exh.application, exh.phase).catch((err) =>
                console.error('Exhibitor email failed:', err.message),
              );
            }
            break;
          }
          const result = await fulfillCheckoutSession(session);
          // Send the confirmation email AFTER the fulfillment transaction
          // commits, routed by order kind. Non-fatal: an email failure must not
          // fail the webhook (the order is already fulfilled).
          if (result?.order && !result.alreadyPaid) {
            const order = result.order;
            const send =
              order.kind === 'ticket' ? sendTicketDelivery
              : order.kind === 'vendor' ? sendBoothConfirmation
              : sendOrderConfirmation;
            await send(order).catch((err) =>
               
              console.error('Confirmation email failed:', err.message),
            );
          }
          break;
        }
        case 'payment_intent.succeeded': {
          // On-site (Payment Element) checkout. Fulfil from the PaymentIntent via
          // the same logic as Checkout Sessions. PaymentIntents created by a
          // Checkout Session don't carry our order_id, so they're skipped here
          // (those fulfil via checkout.session.completed instead).
          const pi = event.data.object;
          if (!pi.metadata?.order_id) break;
          const result = await fulfillCheckoutSession({
            metadata: pi.metadata,
            payment_intent: pi.id,
            id: null,
            shipping_details: pi.shipping ?? null,
          });
          if (result?.order && !result.alreadyPaid) {
            const order = result.order;
            const send =
              order.kind === 'ticket' ? sendTicketDelivery
              : order.kind === 'vendor' ? sendBoothConfirmation
              : sendOrderConfirmation;
            await send(order).catch((err) => console.error('Confirmation email failed:', err.message));
          }
          break;
        }
        default:
          break; // ignore unhandled event types
      }
    } catch (err) {
      // Let Stripe retry; remove the dedupe marker so the retry is processed.
      await query(`DELETE FROM webhook_events WHERE id = $1`, [event.id]).catch(() => {});
       
      console.error('Webhook handler error:', err.message);
      return res.status(500).send('Handler error');
    }

    res.json({ received: true });
  },
);
