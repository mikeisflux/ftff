import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../lib/api.js';

const money = (cents, cur = 'USD') =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: cur.toUpperCase() }).format(
    (cents || 0) / 100,
  );

const REDIRECT_SECONDS = 5;

// Post-checkout confirmation. The server verifies the payment with Stripe and
// fulfills on read, so this normally resolves to "paid" on the first poll; we
// still poll briefly in case of lag. On success we show a clear confirmation
// and auto-redirect home after a short countdown (§15).
export default function CheckoutSuccess() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const sessionId = params.get('session_id');
  const paymentIntent = params.get('payment_intent'); // on-site Payment Element flow
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [settled, setSettled] = useState(false); // polling finished (paid or gave up)
  const [countdown, setCountdown] = useState(REDIRECT_SECONDS);

  const paid = data?.order?.status === 'paid';

  useEffect(() => {
    if (!sessionId && !paymentIntent) {
      setError('Missing order reference.');
      return undefined;
    }
    const lookup = sessionId
      ? `/checkout/session/${encodeURIComponent(sessionId)}`
      : `/checkout/intent/${encodeURIComponent(paymentIntent)}`;
    let tries = 0;
    let timer;
    async function poll() {
      try {
        const res = await api(lookup);
        setData(res);
        if (res.order.status === 'paid') { setSettled(true); return; }
        if (tries < 8) { tries += 1; timer = setTimeout(poll, 1500); }
        else { setSettled(true); }
      } catch (err) {
        setError(err.message || 'Could not load your order.');
      }
    }
    poll();
    return () => clearTimeout(timer);
  }, [sessionId, paymentIntent]);

  // Once paid, count down and auto-redirect to the homepage.
  useEffect(() => {
    if (!paid) return undefined;
    if (countdown <= 0) { navigate('/'); return undefined; }
    const t = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [paid, countdown, navigate]);

  if (error) {
    return (
      <div className="section container">
        <h1 className="glow">Order</h1>
        <p style={{ color: 'var(--color-danger)' }}>{error}</p>
        <Link className="btn secondary" to="/buy-tickets">Back to tickets</Link>
      </div>
    );
  }

  if (!data) {
    return <div className="section container"><p className="muted">Confirming your payment…</p></div>;
  }

  // Paid → success confirmation + auto-redirect.
  if (paid) {
    return (
      <div className="section container" style={{ maxWidth: 720, textAlign: 'center' }}>
        <div style={{ fontSize: '3.4rem', lineHeight: 1 }}>✅</div>
        <h1 className="glow" style={{ marginTop: 8 }}>Payment successful!</h1>
        <p style={{ fontSize: '1.1rem' }}>Thank you — your order is confirmed.</p>
        <div className="card" style={{ textAlign: 'left', maxWidth: 460, margin: '16px auto' }}>
          <p>Order <strong>{data.order.orderNumber}</strong></p>
          <p>Total paid: <strong>{money(data.order.totalCents, data.order.currency)}</strong></p>
        </div>

        {data.tickets?.length > 0 && (
          <section style={{ marginTop: 12 }}>
            <h2>Your tickets</h2>
            <p className="muted">Also emailed to you. Open each on your phone for entry.</p>
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

        <p className="muted" style={{ marginTop: 20 }}>
          Redirecting to the homepage in {countdown}s…
        </p>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
          <button className="btn" onClick={() => navigate('/')}>Go to homepage now</button>
          <Link className="btn secondary" to="/shop">Keep shopping</Link>
        </div>
      </div>
    );
  }

  // Not yet paid. With the server-side fallback this is rare; show a calm
  // "processing" state (never a scary dead-end) once polling has settled.
  return (
    <div className="section container" style={{ maxWidth: 720, textAlign: 'center' }}>
      <h1 className="glow">{settled ? 'Payment processing' : 'Confirming your payment…'}</h1>
      <div className="card" style={{ textAlign: 'left', maxWidth: 460, margin: '16px auto' }}>
        <p>Order <strong>{data.order.orderNumber}</strong></p>
        <p>Total: {money(data.order.totalCents, data.order.currency)}</p>
      </div>
      <p className="muted">
        {settled
          ? 'Your payment is still finalizing. You’ll receive a confirmation email shortly — no need to pay again.'
          : 'Hang tight, this only takes a moment.'}
      </p>
      <Link className="btn secondary" to="/">Back to homepage</Link>
    </div>
  );
}
