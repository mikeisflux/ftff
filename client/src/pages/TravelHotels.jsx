import { Link } from 'react-router-dom';
import HeroCarousel from '../components/HeroCarousel.jsx';

// Nearby hotels for For The Fans Fest at Harrah's Resort Atlantic City. Rates
// fluctuate by date, so we link straight to each hotel's booking page rather
// than hardcoding prices.
const HOTELS = [
  {
    name: "Harrah's Resort Atlantic City",
    img: '/retailers/hero-gettinghere.png',
    location: "777 Harrah's Blvd, Atlantic City, NJ 08401",
    distance: 'Host hotel — the venue itself',
    tel: '(609) 441-5000',
    book: 'https://www.caesars.com/harrahs-atlantic-city',
    host: true,
  },
  {
    name: 'Borgata Hotel Casino & Spa',
    img: '/retailers/hero-2.png',
    location: '1 Borgata Way, Atlantic City, NJ 08401',
    distance: 'About 0.5 miles — Marina District',
    tel: '(609) 317-1000',
    book: 'https://www.theborgata.com/',
  },
  {
    name: 'Golden Nugget Atlantic City',
    img: '/retailers/hero-3.png',
    location: '600 Huron Ave, Atlantic City, NJ 08401',
    distance: 'About 0.6 miles — Marina District',
    tel: '(609) 441-2000',
    book: 'https://www.goldennugget.com/atlantic-city/',
  },
  {
    name: 'Ocean Casino Resort',
    img: '/retailers/hero-1.png',
    location: '500 Boardwalk, Atlantic City, NJ 08401',
    distance: 'About 3 miles — Boardwalk',
    tel: '(609) 783-8899',
    book: 'https://www.theoceanac.com/',
  },
  {
    name: 'Hard Rock Hotel & Casino Atlantic City',
    img: '/retailers/hero-corporate.png',
    location: '1000 Boardwalk, Atlantic City, NJ 08401',
    distance: 'About 3 miles — Boardwalk',
    tel: '(609) 449-1000',
    book: 'https://casino.hardrock.com/atlantic-city',
  },
];

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
            <img src={h.img} alt={h.name} style={{ width: '100%', borderRadius: 'var(--radius)', display: 'block', order: i % 2 ? 2 : 1 }} />
            <div style={{ order: i % 2 ? 1 : 2 }}>
              <h2 style={{ marginTop: 0 }}>{h.name}{h.host && <span className="menu-cta" style={{ marginLeft: 10, fontSize: '.7rem', padding: '2px 10px' }}>HOST</span>}</h2>
              <p><strong>Location:</strong> {h.location}</p>
              <p><strong>Distance:</strong> {h.distance}</p>
              <p><strong>Tel:</strong> <a href={`tel:${h.tel.replace(/[^0-9]/g, '')}`}>{h.tel}</a></p>
              <a className="btn" href={h.book} target="_blank" rel="noopener">Book Now</a>
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
