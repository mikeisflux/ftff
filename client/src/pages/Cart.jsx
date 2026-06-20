import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useCart } from '../store/CartContext.jsx';
import { useConfig } from '../store/ConfigContext.jsx';
import { api } from '../lib/api.js';
import StripePayment from '../components/StripePayment.jsx';

const money = (cents, cur = 'USD') =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: cur.toUpperCase() }).format((cents || 0) / 100);

// On-site (white-label) store checkout. Step 1 reviews the cart + contact; step
// 2 renders the branded Payment Element (with a shipping Address Element) right
// on our page — no redirect to stripe.com.
export default function Cart() {
  const cart = useCart();
  const { config } = useConfig();
  const [customer, setCustomer] = useState({ name: '', email: '' });
  const [delivery, setDelivery] = useState('pickup');
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState('');
  const [intent, setIntent] = useState(null);

  const hasPhysical = cart.items.some((i) => (i.fulfillment || 'physical') === 'physical');
  const shipsFor = cart.items.reduce(
    (n, i) => n + ((i.fulfillment || 'physical') === 'physical' ? (i.shippingCents || 0) * i.quantity : 0), 0);
  const shippingCents = hasPhysical && delivery === 'ship' ? shipsFor : 0;
  const grandTotal = cart.totalCents + shippingCents;

  async function continueToPayment(e) {
    e.preventDefault();
    setStatus('submitting');
    setError('');
    try {
      const res = await api('/checkout/store/intent', {
        method: 'POST',
        body: {
          items: cart.items.map((i) => ({ variantId: i.variantId, quantity: i.quantity })),
          customer,
          ...(hasPhysical ? { delivery } : {}),
        },
      });
      setIntent(res);
      setStatus('idle');
      window.scrollTo(0, 0);
    } catch (err) {
      setStatus('error');
      setError(
        err.data?.code === 'out_of_stock' ? err.message
        : err.data?.code === 'stripe_unconfigured' ? 'Store checkout isn’t open yet.'
        : err.message || 'Checkout failed.',
      );
    }
  }

  if (cart.items.length === 0 && !intent) {
    return (
      <div className="section container">
        <h1 className="glow">Your Cart</h1>
        <p className="muted">Your cart is empty.</p>
        <Link className="btn secondary" to="/shop">Browse the shop</Link>
      </div>
    );
  }

  // Step 2 — branded on-site payment.
  if (intent) {
    return (
      <div className="section container" style={{ maxWidth: 560 }}>
        <h1 className="glow">Checkout</h1>
        <div className="card" style={{ maxWidth: 520, marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '1.2rem' }}>
            <span>Total</span><strong>{money(intent.amountCents)}</strong>
          </div>
          <p className="muted" style={{ margin: '6px 0 0' }}>
            Order {intent.orderNumber} · {intent.deliveryMethod === 'ship' ? 'shipping' : intent.deliveryMethod === 'pickup' ? 'pickup at the show' : 'digital'} · receipt to {customer.email}
          </p>
        </div>
        {config?.stripePublishableKey ? (
          <StripePayment
            publishableKey={config.stripePublishableKey}
            clientSecret={intent.clientSecret}
            returnPath="/checkout/success"
            amountLabel={money(intent.amountCents)}
            collectShipping={intent.deliveryMethod === 'ship'}
          />
        ) : (
          <p className="muted">Payments aren’t configured yet.</p>
        )}
        <p style={{ marginTop: 14 }}>
          <button className="btn secondary" onClick={() => { setIntent(null); setStatus('idle'); }}>← Back to cart</button>
        </p>
      </div>
    );
  }

  // Step 1 — review cart + contact.
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
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 12 }}>
          <span className="muted">Subtotal</span><span>{money(cart.totalCents)}</span>
        </div>
        {hasPhysical && (
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
            <span className="muted">Shipping</span>
            <span>{delivery === 'ship' ? (shippingCents > 0 ? money(shippingCents) : 'Free') : 'Pickup — free'}</span>
          </div>
        )}
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, fontSize: '1.2rem' }}>
          <span>Total</span><strong>{money(grandTotal)}</strong>
        </div>
      </div>

      {hasPhysical && (
        <div className="card" style={{ marginTop: 16 }}>
          <h3>Delivery</h3>
          <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '8px 0', cursor: 'pointer' }}>
            <input type="radio" name="delivery" style={{ width: 'auto', marginTop: 4 }} checked={delivery === 'pickup'} onChange={() => setDelivery('pickup')} />
            <span><strong>Pick up at the show</strong><br /><span className="muted" style={{ fontSize: '.9rem' }}>Collect your items at For The Fans Fest — no shipping charge.</span></span>
          </label>
          <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '8px 0', cursor: 'pointer' }}>
            <input type="radio" name="delivery" style={{ width: 'auto', marginTop: 4 }} checked={delivery === 'ship'} onChange={() => setDelivery('ship')} />
            <span><strong>Ship to me {shipsFor > 0 ? `· ${money(shipsFor)}` : '· Free'}</strong><br /><span className="muted" style={{ fontSize: '.9rem' }}>We’ll collect your address on the next step and ship after payment.</span></span>
          </label>
        </div>
      )}

      <form className="card" style={{ marginTop: 16 }} onSubmit={continueToPayment}>
        <h3>Checkout</h3>
        <label>Full name</label>
        <input value={customer.name} onChange={(e) => setCustomer((c) => ({ ...c, name: e.target.value }))} required />
        <label>Email</label>
        <input type="email" value={customer.email} onChange={(e) => setCustomer((c) => ({ ...c, email: e.target.value }))} required />
        {status === 'error' && <p style={{ color: 'var(--color-danger)' }}>{error}</p>}
        <div style={{ marginTop: 14 }}>
          <button className="btn" disabled={status === 'submitting'}>
            {status === 'submitting' ? 'Loading…' : `Continue to payment · ${money(grandTotal)}`}
          </button>
        </div>
        <p className="muted" style={{ fontSize: '.8rem', marginTop: 8 }}>Payment{delivery === 'ship' ? ' and shipping' : ''} completed securely on our site.</p>
      </form>
    </div>
  );
}
