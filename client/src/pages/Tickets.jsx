import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api.js';
import { useConfig } from '../store/ConfigContext.jsx';
import StripePayment from '../components/StripePayment.jsx';

// Persist an exhibitor referral code (?ref=CODE) so the sale is attributed even
// if the buyer browses before checking out.
function captureReferral() {
  try {
    const code = new URLSearchParams(window.location.search).get('ref');
    if (code) localStorage.setItem('ftff_ref', code.slice(0, 40));
  } catch { /* ignore */ }
}

const money = (cents, cur = 'USD') =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: cur.toUpperCase() }).format((cents || 0) / 100);

// On-site (white-label) ticket checkout (§8, §15). Step 1 collects quantities +
// buyer contact; step 2 renders Stripe's branded Payment Element directly on the
// page (no redirect to stripe.com). Card data stays in Stripe's iframe (SAQ A).
export default function Tickets() {
  const { config } = useConfig();
  const { data } = useQuery({ queryKey: ['ticket-types'], queryFn: () => api('/ticket-types') });
  const types = data?.ticketTypes ?? [];

  const [qty, setQty] = useState({});
  const [customer, setCustomer] = useState({ name: '', email: '' });
  const [status, setStatus] = useState('idle'); // idle | submitting | error
  const [error, setError] = useState('');
  const [intent, setIntent] = useState(null); // { clientSecret, orderNumber }

  useEffect(() => { captureReferral(); }, []);

  const setCount = (code, n) => setQty((q) => ({ ...q, [code]: Math.max(0, Math.min(20, n)) }));
  const items = types.filter((t) => (qty[t.code] || 0) > 0).map((t) => ({ code: t.code, quantity: qty[t.code] }));
  const currency = types[0]?.currency || 'usd';
  const total = types.reduce((sum, t) => sum + (qty[t.code] || 0) * t.price_cents, 0);
  const hasItems = items.length > 0;

  async function continueToPayment(e) {
    e.preventDefault();
    setStatus('submitting');
    setError('');
    try {
      const referralCode = (() => { try { return localStorage.getItem('ftff_ref') || undefined; } catch { return undefined; } })();
      const res = await api('/checkout/tickets/intent', { method: 'POST', body: { items, customer, referralCode } });
      setIntent(res);
      setStatus('idle');
      window.scrollTo(0, 0);
    } catch (err) {
      setStatus('error');
      setError(
        err.data?.code === 'stripe_unconfigured'
          ? 'Online ticket sales aren’t open yet. Please check back soon.'
          : err.data?.details?.[0]?.message || err.message || 'Checkout failed.',
      );
    }
  }

  // Step 2 — branded on-site payment.
  if (intent) {
    return (
      <div className="section container" style={{ maxWidth: 560 }}>
        <h1 className="glow">Checkout</h1>
        <div className="card" style={{ maxWidth: 520, marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '1.2rem' }}>
            <span>Total</span><strong>{money(total, currency)}</strong>
          </div>
          <p className="muted" style={{ margin: '6px 0 0' }}>Order {intent.orderNumber} · tickets sent to {customer.email}</p>
        </div>
        {config?.stripePublishableKey ? (
          <StripePayment
            publishableKey={config.stripePublishableKey}
            clientSecret={intent.clientSecret}
            returnPath="/checkout/success"
            amountLabel={money(total, currency)}
          />
        ) : (
          <p className="muted">Payments aren’t configured yet.</p>
        )}
        <p style={{ marginTop: 14 }}>
          <button className="btn secondary" onClick={() => { setIntent(null); setStatus('idle'); }}>← Back to tickets</button>
        </p>
      </div>
    );
  }

  // Step 1 — pick quantities + contact.
  return (
    <div className="section container">
      <h1 className="glow">Buy Tickets</h1>

      {types.length === 0 ? (
        <p className="muted">Ticket types will be announced soon.</p>
      ) : (
        <form onSubmit={continueToPayment}>
          <div className="grid cols-3">
            {types.map((t) => (
              <div className="card" key={t.id} style={{ padding: 0, overflow: 'hidden' }}>
                {t.image_url && <img src={t.image_url} alt={t.name} style={{ width: '100%', display: 'block' }} />}
                <div style={{ padding: 20 }}>
                  <h3 style={{ marginTop: 0 }}>{t.name}</h3>
                  <p className="muted">{t.description}</p>
                  <p style={{ fontSize: '1.6rem', margin: '8px 0' }}>{money(t.price_cents, t.currency)}</p>
                  {t.is_digital && <p className="muted">Includes Virtual Con Experience access.</p>}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8 }}>
                    <button type="button" className="btn secondary" onClick={() => setCount(t.code, (qty[t.code] || 0) - 1)} aria-label={`Decrease ${t.name}`}>−</button>
                    <span style={{ minWidth: 24, textAlign: 'center' }}>{qty[t.code] || 0}</span>
                    <button type="button" className="btn secondary" onClick={() => setCount(t.code, (qty[t.code] || 0) + 1)} aria-label={`Increase ${t.name}`}>+</button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="card" style={{ marginTop: 20, maxWidth: 520 }}>
            <h3>Checkout</h3>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '1.2rem' }}>
              <span>Total</span>
              <strong>{money(total, currency)}</strong>
            </div>
            <label>Full name</label>
            <input value={customer.name} onChange={(e) => setCustomer((c) => ({ ...c, name: e.target.value }))} required />
            <label>Email (tickets are sent here)</label>
            <input type="email" value={customer.email} onChange={(e) => setCustomer((c) => ({ ...c, email: e.target.value }))} required />
            {status === 'error' && <p style={{ color: 'var(--color-danger)' }}>{error}</p>}
            <div style={{ marginTop: 16 }}>
              <button className="btn" disabled={!hasItems || status === 'submitting'}>
                {status === 'submitting' ? 'Loading…' : `Continue to payment · ${money(total, currency)}`}
              </button>
            </div>
            <p className="muted" style={{ marginTop: 10, fontSize: '.85rem' }}>
              Secure payment by Stripe — completed right here on our site. Your card details never touch our servers.
            </p>
          </div>
        </form>
      )}
    </div>
  );
}
