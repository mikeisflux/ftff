import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import HeroCarousel from '../components/HeroCarousel.jsx';

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
  const featured = guests.data?.guests ?? [];
  const directionsUrl = show?.address
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(show.address)}`
    : null;

  return (
    <div>
      {/* Hero carousel (§7.1.1) */}
      <HeroCarousel
        slides={slides.data?.slides ?? []}
        fallbackTitle={show?.name ?? 'For The Fans Fest'}
        fallbackSubtitle={show?.tagline}
      />

      {/* Show info & location (§7.1.2) */}
      {show && (
        <section className="section container">
          <h2>When &amp; Where</h2>
          <div className="grid info-grid" style={{ alignItems: 'stretch' }}>
            <div className="card">
              <p><strong>{show.venue}</strong></p>
              <p className="muted">{show.address}</p>
              {show.starts_on && <p>{show.starts_on} – {show.ends_on}</p>}
              {Array.isArray(show.hours_json) && show.hours_json.length > 0 && (
                <ul>
                  {show.hours_json.map((h) => (
                    <li key={h.day}>{h.day}: {h.open}–{h.close}</li>
                  ))}
                </ul>
              )}
              {directionsUrl && (
                <a className="btn secondary" href={directionsUrl} target="_blank" rel="noopener">
                  Get Directions
                </a>
              )}
            </div>
            {show.address && (
              <div className="card" style={{ padding: 0, overflow: 'hidden', minHeight: 280 }}>
                {/* Embedded venue map. Keyless Google Maps embed — renders the
                    venue location without exposing any API key to the browser. */}
                <iframe
                  title={`Map of ${show.venue || 'the venue'}`}
                  src={`https://maps.google.com/maps?q=${encodeURIComponent(show.address)}&z=15&output=embed`}
                  loading="lazy"
                  referrerPolicy="no-referrer-when-downgrade"
                  style={{ border: 0, width: '100%', height: '100%', minHeight: 280 }}
                  allowFullScreen
                />
              </div>
            )}
          </div>
        </section>
      )}

      {/* Ticket cards (§7.1.3) */}
      {tickets.data?.ticketTypes?.length > 0 && (
        <section className="section container">
          <h2>Buy Tickets</h2>
          <div className="grid cols-3">
            {tickets.data.ticketTypes.map((t) => (
              <div className="card" key={t.id}>
                <h3>{t.name}</h3>
                <p className="muted">{t.description}</p>
                <p style={{ fontSize: '1.4rem' }}>{money(t.price_cents, t.currency)}</p>
                <Link to="/buy-tickets" className="btn">View</Link>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Featured guests — up to 8 (§7.1.4) */}
      <section className="section container">
        <h2>Featured Guests</h2>
        {featured.length > 0 ? (
          <>
            <div className="grid cols-4">
              {featured.map((g) => (
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
          </>
        ) : (
          <p className="muted">Guest announcements are coming soon — check back shortly.</p>
        )}
      </section>
    </div>
  );
}
