import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../lib/api.js';
import { money } from '../lib/exhibitorPricing.js';

// Post-Stripe redirect for exhibitor payments. Polls briefly for the webhook to
// flip the application to paid (deposit or full).
export default function ExhibitorSuccess() {
  const [params] = useSearchParams();
  const sessionId = params.get('session_id');
  const [app, setApp] = useState(null);
  const [tries, setTries] = useState(0);

  useEffect(() => {
    if (!sessionId) return undefined;
    let active = true;
    api(`/exhibitor/session/${sessionId}`)
      .then((d) => active && setApp(d.application))
      .catch(() => {});
    const t = setTimeout(() => active && setTries((n) => n + 1), 2000);
    return () => { active = false; clearTimeout(t); };
  }, [sessionId, tries]);

  const paid = app && ['deposit_paid', 'paid_in_full'].includes(app.status);

  return (
    <div className="section container" style={{ maxWidth: 640 }}>
      <h1 className="glow">Exhibitor payment</h1>
      <div className="card">
        {!sessionId ? (
          <p className="muted">No payment session found.</p>
        ) : !paid ? (
          <p className="muted">Confirming your payment… this can take a few seconds.</p>
        ) : (
          <>
            <p style={{ color: 'var(--color-success)' }}>✓ Payment received — you’re confirmed!</p>
            <p>Reference <strong>{app.reference}</strong></p>
            <p>Paid: {money(app.amount_paid_cents)} of {money(app.total_cents)}.</p>
            {app.balance_cents > 0 && (
              <p className="muted">Balance of {money(app.balance_cents)} is due before the show — we’ll email you a payment link in advance.</p>
            )}
          </>
        )}
        <p style={{ marginTop: 16 }}><Link to="/" className="btn secondary">Back to home</Link></p>
      </div>
    </div>
  );
}
