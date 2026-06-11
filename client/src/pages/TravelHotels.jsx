import { Link } from 'react-router-dom';
import HeroCarousel from '../components/HeroCarousel.jsx';
import { HOTELS } from '../content/hotels.js';

// Nearby hotels for For The Fans Fest at Harrah's Resort Atlantic City. Each
// tile links to a per-hotel page; rates fluctuate by date, so we link straight
// to each hotel's booking page rather than hardcoding prices.
export default function TravelHotels() {
  const slides = [{
    id: 0,
    image_url: '/retailers/hero-travel.png',
    title: 'Travel & Hotels',
    subtitle: 'Check in. Geek out. Atlantic City has a room for every kind of fan — book early before the show weekend fills up.',
    cta_url: '/sign-up',
    cta_label: 'Get Updates',
  }];

  return (
    <div>
      <HeroCarousel slides={slides} fallbackTitle="Travel & Hotels" />

      <div className="section container">
        <p style={{ fontSize: '1.1rem', maxWidth: 860 }}>
          For The Fans Fest takes over <strong>Harrah's Resort Atlantic City</strong> — stay right at the venue, or pick
          another spot in the Marina District or on the Boardwalk. Rooms go fast on event weekends, so lock yours in early.
        </p>

        {HOTELS.map((h, i) => (
          <div className="info-row" key={h.name} style={{ marginTop: i === 0 ? 24 : 36 }}>
            {/* alternate image side on wide screens */}
            <Link to={`/travel-hotels/${h.slug}`} style={{ order: i % 2 ? 2 : 1, display: 'block' }}>
              <img src={h.img} alt={h.name} style={{ width: '100%', borderRadius: 'var(--radius)', display: 'block' }} />
            </Link>
            <div style={{ order: i % 2 ? 1 : 2 }}>
              <h2 style={{ marginTop: 0 }}>
                <Link to={`/travel-hotels/${h.slug}`} style={{ color: 'inherit', textDecoration: 'none' }}>{h.name}</Link>
                {h.host && <span className="menu-cta" style={{ marginLeft: 10, fontSize: '.7rem', padding: '2px 10px' }}>HOST</span>}
              </h2>
              <p><strong>Location:</strong> {h.location}</p>
              <p><strong>Distance:</strong> {h.distance}</p>
              <p><strong>Tel:</strong> <a href={`tel:${h.tel.replace(/[^0-9]/g, '')}`}>{h.tel}</a></p>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <Link className="btn" to={`/travel-hotels/${h.slug}`}>More Info &amp; Photos</Link>
                <a className="btn secondary" href={h.book} target="_blank" rel="noopener">Book Now</a>
              </div>
            </div>
          </div>
        ))}

        <p className="muted" style={{ marginTop: 24 }}>
          Want news on guests, tickets, and any official room blocks? <Link to="/sign-up">Sign up for updates</Link>.
        </p>
      </div>
    </div>
  );
}
