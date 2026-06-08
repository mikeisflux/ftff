import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '../lib/api.js';

const money = (cents, cur = 'USD') =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: cur.toUpperCase() }).format(
    (cents || 0) / 100,
  );

export default function Home() {
  const slides = useQuery({ queryKey: ['slides'], queryFn: () => api('/slides') });
  const info = useQuery({ queryKey: ['show-info'], queryFn: () => api('/show-info') });
  const tickets = useQuery({ queryKey: ['ticket-types'], queryFn: () => api('/ticket-types') });
  const guests = useQuery({ queryKey: ['guests-featured'], queryFn: () => api('/guests?featured=true') });

  const show = info.data?.showInfo;
  const hero = slides.data?.slides?.[0];

  return (
    <div>
      {/* Hero (§7.1.1) */}
      <section
        className="hero section"
        style={{
          background: hero?.image_url
            ? `linear-gradient(180deg, rgba(0,0,0,.2), rgba(0,0,0,.6)), url(${hero.image_url}) center/cover`
            : undefined,
        }}
      >
        <div className="container">
          <h1 className="glow">{hero?.title || show?.name || 'FAN EXPO Chicago'}</h1>
          <p className="muted" style={{ fontSize: '1.2rem' }}>
            {hero?.subtitle || show?.tagline}
          </p>
          <Link to="/buy-tickets" className="btn">Buy Tickets</Link>
        </div>
      </section>

      {/* Show info & location (§7.1.2) */}
      {show && (
        <section className="section container">
          <h2>When & Where</h2>
          <div className="card">
            <p><strong>{show.venue}</strong></p>
            <p className="muted">{show.address}</p>
            <p>{show.starts_on} – {show.ends_on}</p>
            {Array.isArray(show.hours_json) && (
              <ul>
                {show.hours_json.map((h) => (
                  <li key={h.day}>{h.day}: {h.open}–{h.close}</li>
                ))}
              </ul>
            )}
          </div>
        </section>
      )}

      {/* Ticket cards (§7.1.3) */}
      <section className="section container">
        <h2>Buy Tickets</h2>
        <div className="grid cols-3">
          {tickets.data?.ticketTypes?.map((t) => (
            <div className="card" key={t.id}>
              <h3>{t.name}</h3>
              <p className="muted">{t.description}</p>
              <p style={{ fontSize: '1.4rem' }}>{money(t.price_cents, t.currency)}</p>
              <Link to="/buy-tickets" className="btn">Add</Link>
            </div>
          ))}
        </div>
      </section>

      {/* Featured guests — exactly 8 (§7.1.4) */}
      <section className="section container">
        <h2>Featured Guests</h2>
        <div className="grid cols-4">
          {guests.data?.guests?.map((g) => (
            <div className="card" key={g.id}>
              {g.headshot_url && (
                <img src={g.headshot_url} alt={g.name} style={{ width: '100%', borderRadius: 8 }} />
              )}
              <h3 style={{ margin: '8px 0 0' }}>{g.name}</h3>
              <p className="muted">{g.known_for}</p>
            </div>
          ))}
        </div>
        <p style={{ marginTop: 16 }}>
          <Link to="/all-guests" className="btn secondary">View More Guests</Link>
        </p>
      </section>
    </div>
  );
}
