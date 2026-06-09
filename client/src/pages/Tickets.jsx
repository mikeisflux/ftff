import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api.js';

const money = (cents, cur = 'USD') =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: cur.toUpperCase() }).format(
    (cents || 0) / 100,
  );

// Real ticket checkout (§8, §15). Quantities + buyer contact are posted to
// /checkout/tickets; the server prices the order and returns a Stripe-hosted
// Checkout URL we redirect to. Card data never touches our app (SAQ A).
export default function Tickets() {
  const { data } = useQuery({ queryKey: ['ticket-types'], queryFn: () => api('/ticket-types') });
  const types = data?.ticketTypes ?? [];

  const [qty, setQty] = useState({}); // code -> quantity
  const [customer, setCustomer] = useState({ name: '', email: '' });
  const [status, setStatus] = useState('idle'); // idle | submitting | error
  const [error, setError] = useState('');

  const setCount = (code, n) =>
    setQty((q) => ({ ...q, [code]: Math.max(0, Math.min(20, n)) }));

  const items = types
    .filter((t) => (qty[t.code] || 0) > 0)
    .map((t) => ({ code: t.code, quantity: qty[t.code] }));

  const currency = types[0]?.currency || 'usd';
  const total = types.reduce((sum, t) => sum + (qty[t.code] || 0) * t.price_cents, 0);
  const hasItems = items.length > 0;

  async function checkout(e) {
    e.preventDefault();
    setStatus('submitting');
    setError('');
    try {
      const { url } = await api('/checkout/tickets', {
        method: 'POST',
        body: { items, customer },
      });
      window.location.assign(url); // redirect to Stripe-hosted Checkout
    } catch (err) {
      setStatus('error');
      setError(
        err.data?.code === 'stripe_unconfigured'
          ? 'Online ticket sales aren’t open yet. Please check back soon.'
          : err.data?.details?.[0]?.message || err.message || 'Checkout failed.',
      );
    }
  }

  return (
    <div className="section container">
      <h1 className="glow">Buy Tickets</h1>

      {types.length === 0 ? (
        <p className="muted">Ticket types will be announced soon.</p>
      ) : (
        <form onSubmit={checkout}>
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
                {status === 'submitting' ? 'Redirecting…' : `Pay ${money(total, currency)}`}
              </button>
            </div>
            <p className="muted" style={{ marginTop: 10, fontSize: '.85rem' }}>
              Secure payment by Stripe. Your card details never touch our servers.
            </p>
          </div>
        </form>
      )}
    </div>
  );
}
