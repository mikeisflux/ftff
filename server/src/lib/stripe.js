import Stripe from 'stripe';
import { getSettingValue } from './settings.js';
import { HttpError } from './http.js';

// Stripe client built from the secret key stored (encrypted) in settings (§5,
// §15). Cached and rebuilt only when the key changes. The API key never leaves
// the server; the browser only ever receives the hosted Checkout URL.

let cached = { key: null, client: null };

export async function getStripe() {
  const key = await getSettingValue('stripe.secret_key');
  if (!key) {
    throw new HttpError(503, 'Payments are not configured yet.', 'stripe_unconfigured');
  }
  if (cached.key !== key) {
    cached = { key, client: new Stripe(key) };
  }
  return cached.client;
}

export async function getCurrency() {
  return (await getSettingValue('stripe.currency')) || 'usd';
}
