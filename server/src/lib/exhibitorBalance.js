import { query } from '../db/pool.js';
import { env } from '../config/env.js';
import { getStripe } from './stripe.js';
import { getSettingValue } from './settings.js';
import { sendExhibitorBalanceRequest } from './email.js';

// Create a Stripe Checkout session for an exhibitor's outstanding balance and
// email them the pay link. Shared by the admin "Send balance invoice" button
// and the automatic pre-show reminder. Marks balance_request_sent_at so the
// auto-job doesn't double-send. Returns { url } (or throws if not payable).
export async function sendBalanceInvoice(app) {
  if (app.status !== 'deposit_paid' || app.balance_cents <= 0) {
    const err = new Error('No outstanding balance to invoice.');
    err.code = 'no_balance';
    throw err;
  }
  const stripe = await getStripe();
  const currency = (await getSettingValue('stripe.currency')) || 'usd';

  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    customer_email: app.contact_email,
    line_items: [{
      quantity: 1,
      price_data: {
        currency,
        unit_amount: app.balance_cents,
        product_data: { name: `Exhibitor balance — ${app.vendor_name} (${app.reference})` },
      },
    }],
    metadata: {
      kind: 'exhibitor',
      application_id: app.id,
      reference: app.reference,
      phase: 'balance',
    },
    success_url: `${env.CLIENT_ORIGIN}/become-an-exhibitor/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${env.CLIENT_ORIGIN}/`,
  });

  await query(
    `UPDATE exhibitor_applications SET balance_session_id=$2, balance_request_sent_at=now() WHERE id=$1`,
    [app.id, session.id],
  );
  await sendExhibitorBalanceRequest(app, { url: session.url }).catch(() => {});
  return { url: session.url, sessionId: session.id };
}
