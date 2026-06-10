import { useEffect, useRef, useState } from 'react';
import { getStripe, stripeAppearance } from '../lib/stripe.js';

// Branded, on-site Stripe Payment Element. Mounts Stripe's payment iframe inside
// our own page (no redirect to stripe.com) and confirms the PaymentIntent.
// `automatic_payment_methods` on the server means every method enabled in the
// Stripe account shows here (cards, wallets, Klarna, etc.).
export default function StripePayment({ publishableKey, clientSecret, returnPath, amountLabel, collectShipping = false }) {
  const mountRef = useRef(null);
  const shipRef = useRef(null);
  const stripeRef = useRef(null);
  const elementsRef = useRef(null);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    let paymentElement = null;
    let addressElement = null;
    (async () => {
      try {
        const stripe = await getStripe(publishableKey);
        if (cancelled) return;
        const elements = stripe.elements({ clientSecret, appearance: stripeAppearance });
        if (collectShipping) {
          addressElement = elements.create('address', { mode: 'shipping' });
          addressElement.mount(shipRef.current);
        }
        paymentElement = elements.create('payment', { layout: 'tabs' });
        paymentElement.mount(mountRef.current);
        paymentElement.on('ready', () => !cancelled && setReady(true));
        stripeRef.current = stripe;
        elementsRef.current = elements;
      } catch (err) {
        if (!cancelled) setError(err.message || 'Could not start payment.');
      }
    })();
    return () => {
      cancelled = true;
      try { paymentElement?.unmount(); } catch { /* already gone */ }
      try { addressElement?.unmount(); } catch { /* already gone */ }
    };
  }, [publishableKey, clientSecret, collectShipping]);

  async function pay(e) {
    e.preventDefault();
    if (!stripeRef.current || !elementsRef.current) return;
    setBusy(true);
    setError('');
    const { error: err } = await stripeRef.current.confirmPayment({
      elements: elementsRef.current,
      confirmParams: { return_url: `${window.location.origin}${returnPath}` },
    });
    // If we get here, confirmation failed (otherwise the browser redirected to
    // return_url). Show the message and let the buyer try again.
    setError(err?.message || 'Payment could not be completed.');
    setBusy(false);
  }

  return (
    <form onSubmit={pay} className="card" style={{ maxWidth: 520 }}>
      {collectShipping && (
        <div style={{ marginBottom: 16 }}>
          <h4 style={{ margin: '0 0 8px' }}>Shipping address</h4>
          <div ref={shipRef} />
        </div>
      )}
      <div ref={mountRef} />
      {error && <p style={{ color: 'var(--color-danger)', marginTop: 12 }}>{error}</p>}
      <button className="btn" style={{ marginTop: 16, width: '100%' }} disabled={!ready || busy}>
        {busy ? 'Processing…' : `Pay ${amountLabel}`}
      </button>
      <p className="muted" style={{ fontSize: '.8rem', marginTop: 10, textAlign: 'center' }}>
        Secured by Stripe. Your card details are encrypted and never touch our servers.
      </p>
    </form>
  );
}
