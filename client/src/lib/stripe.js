// Load Stripe.js from the official CDN (CSP already allows js.stripe.com) and
// build a Stripe instance from the account's publishable key. No npm bundle
// needed — keeps card handling in Stripe's iframe (PCI SAQ A) while the rest of
// checkout is rendered on our own branded page.

let scriptPromise = null;
function loadStripeJs() {
  if (window.Stripe) return Promise.resolve(window.Stripe);
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise((resolve, reject) => {
    const existing = document.getElementById('stripe-js');
    if (existing) {
      existing.addEventListener('load', () => resolve(window.Stripe));
      existing.addEventListener('error', reject);
      return;
    }
    const s = document.createElement('script');
    s.id = 'stripe-js';
    s.src = 'https://js.stripe.com/v3/';
    s.async = true;
    s.onload = () => resolve(window.Stripe);
    s.onerror = () => reject(new Error('Could not load Stripe.'));
    document.head.appendChild(s);
  });
  return scriptPromise;
}

let cached = { key: null, instance: null };
export async function getStripe(publishableKey) {
  if (!publishableKey) throw new Error('Payments are not configured yet.');
  if (cached.key === publishableKey && cached.instance) return cached.instance;
  const Stripe = await loadStripeJs();
  cached = { key: publishableKey, instance: Stripe(publishableKey) };
  return cached.instance;
}

// Payment Element appearance matched to the For The Fans Fest dark theme.
export const stripeAppearance = {
  theme: 'night',
  variables: {
    colorPrimary: '#7c3aed',
    colorBackground: '#0f0f1f',
    colorText: '#f5f3ff',
    colorTextSecondary: '#9aa0b4',
    colorDanger: '#ef4444',
    fontFamily: 'Roboto, system-ui, sans-serif',
    borderRadius: '12px',
    spacingUnit: '4px',
  },
};
