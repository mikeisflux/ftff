import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '../lib/api.js';

const money = (cents, cur = 'USD') =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: cur.toUpperCase() }).format(
    (cents || 0) / 100,
  );

// Shows the five real ticket types from the database. Online checkout (Stripe)
// is implemented in the payments/ticketing phases (§17 steps 4–5); until then
// this page is informational and does not present a non-working buy button.
export default function Tickets() {
  const { data } = useQuery({ queryKey: ['ticket-types'], queryFn: () => api('/ticket-types') });
  const types = data?.ticketTypes ?? [];

  return (
    <div className="section container">
      <h1 className="glow">Buy Tickets</h1>
      <div
        className="card"
        style={{ borderColor: 'color-mix(in srgb, var(--color-accent) 50%, transparent)', marginBottom: 20 }}
      >
        <strong>Online checkout opens soon.</strong>
        <p className="muted" style={{ margin: '6px 0 0' }}>
          Secure card payments are powered by Stripe and are being finalized.{' '}
          <Link to="/sign-up">Sign up for ticket alerts</Link> and we’ll email you the moment sales open.
        </p>
      </div>

      {types.length === 0 ? (
        <p className="muted">Ticket types will be announced soon.</p>
      ) : (
        <div className="grid cols-3">
          {types.map((t) => (
            <div className="card" key={t.id}>
              <h3>{t.name}</h3>
              <p className="muted">{t.description}</p>
              <p style={{ fontSize: '1.6rem', margin: '8px 0' }}>{money(t.price_cents, t.currency)}</p>
              {t.is_digital && <p className="muted">Includes Virtual Con Experience access.</p>}
              <button className="btn" disabled title="Online checkout opens soon">
                Checkout opening soon
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
