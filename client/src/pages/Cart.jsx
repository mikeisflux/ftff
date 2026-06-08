import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useCart } from '../store/CartContext.jsx';
import { api } from '../lib/api.js';

const money = (cents, cur = 'USD') =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: cur.toUpperCase() }).format((cents || 0) / 100);

export default function Cart() {
  const cart = useCart();
  const [customer, setCustomer] = useState({ name: '', email: '' });
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState('');

  async function checkout(e) {
    e.preventDefault();
    setStatus('submitting');
    setError('');
    try {
      const { url } = await api('/checkout/store', {
        method: 'POST',
        body: { items: cart.items.map((i) => ({ variantId: i.variantId, quantity: i.quantity })), customer },
      });
      window.location.assign(url);
    } catch (err) {
      setStatus('error');
      setError(
        err.data?.code === 'out_of_stock' ? err.message
        : err.data?.code === 'stripe_unconfigured' ? 'Store checkout isn’t open yet.'
        : err.message || 'Checkout failed.',
      );
    }
  }

  if (cart.items.length === 0) {
    return (
      <div className="section container">
        <h1 className="glow">Your Cart</h1>
        <p className="muted">Your cart is empty.</p>
        <Link className="btn secondary" to="/shop">Browse the shop</Link>
      </div>
    );
  }

  return (
    <div className="section container" style={{ maxWidth: 720 }}>
      <h1 className="glow">Your Cart</h1>
      <div className="card">
        {cart.items.map((i) => (
          <div key={i.variantId} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: '1px solid rgba(255,255,255,.08)' }}>
            <div style={{ flex: 1 }}>
              <strong>{i.title}</strong>
              <div className="muted">{money(i.unitPriceCents)}</div>
            </div>
            <input type="number" min="0" value={i.quantity} onChange={(e) => cart.setQty(i.variantId, Number(e.target.value))} style={{ width: 70 }} />
            <div style={{ width: 80, textAlign: 'right' }}>{money(i.unitPriceCents * i.quantity)}</div>
            <button className="btn secondary" onClick={() => cart.remove(i.variantId)}>✕</button>
          </div>
        ))}
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 12, fontSize: '1.2rem' }}>
          <span>Total</span><strong>{money(cart.totalCents)}</strong>
        </div>
      </div>

      <form className="card" style={{ marginTop: 16 }} onSubmit={checkout}>
        <h3>Checkout</h3>
        <label>Full name</label>
        <input value={customer.name} onChange={(e) => setCustomer((c) => ({ ...c, name: e.target.value }))} required />
        <label>Email</label>
        <input type="email" value={customer.email} onChange={(e) => setCustomer((c) => ({ ...c, email: e.target.value }))} required />
        {status === 'error' && <p style={{ color: 'var(--color-danger)' }}>{error}</p>}
        <div style={{ marginTop: 14 }}>
          <button className="btn" disabled={status === 'submitting'}>
            {status === 'submitting' ? 'Redirecting…' : `Pay ${money(cart.totalCents)}`}
          </button>
        </div>
        <p className="muted" style={{ fontSize: '.8rem', marginTop: 8 }}>Shipping is collected securely at Stripe checkout.</p>
      </form>
    </div>
  );
}
