import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../lib/api.js';

const money = (cents, cur = 'USD') =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: cur.toUpperCase() }).format(
    (cents || 0) / 100,
  );

// Post-checkout confirmation. The webhook may lag a moment after redirect, so
// we poll until the order flips to paid and tickets are issued (§15).
export default function CheckoutSuccess() {
  const [params] = useSearchParams();
  const sessionId = params.get('session_id');
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!sessionId) {
      setError('Missing session reference.');
      return undefined;
    }
    let tries = 0;
    let timer;
    async function poll() {
      try {
        const res = await api(`/checkout/session/${encodeURIComponent(sessionId)}`);
        setData(res);
        if (res.order.status !== 'paid' && tries < 10) {
          tries += 1;
          timer = setTimeout(poll, 1500);
        }
      } catch (err) {
        setError(err.message || 'Could not load your order.');
      }
    }
    poll();
    return () => clearTimeout(timer);
  }, [sessionId]);

  if (error) {
    return (
      <div className="section container">
        <h1 className="glow">Order</h1>
        <p style={{ color: 'var(--color-danger)' }}>{error}</p>
        <Link className="btn secondary" to="/buy-tickets">Back to tickets</Link>
      </div>
    );
  }

  if (!data) return <div className="section container"><p className="muted">Confirming your order…</p></div>;

  const paid = data.order.status === 'paid';
  return (
    <div className="section container" style={{ maxWidth: 720 }}>
      <h1 className="glow">{paid ? 'You’re in! 🎉' : 'Processing payment…'}</h1>
      <div className="card">
        <p>Order <strong>{data.order.orderNumber}</strong></p>
        <p>Total: {money(data.order.totalCents, data.order.currency)}</p>
        <p className="muted">Status: {data.order.status}</p>
      </div>

      {paid && data.tickets.length > 0 && (
        <section style={{ marginTop: 20 }}>
          <h2>Your tickets</h2>
          <p className="muted">Open each ticket on your phone for entry. Bookmark these links.</p>
          <div className="grid cols-3">
            {data.tickets.map((t) => (
              <Link key={t.qr_token} to={`/t/${t.qr_token}`} className="card">
                <h3>{t.ticket_name}</h3>
                <p className="muted">{t.attendee_name}</p>
                <span className="btn secondary">View ticket</span>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
