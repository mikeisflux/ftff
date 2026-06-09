import { useQuery } from '@tanstack/react-query';
import HeroCarousel from '../components/HeroCarousel.jsx';
import { api } from '../lib/api.js';

const VENUE = {
  name: "Harrah's Resort Atlantic City",
  address: "777 Harrah's Blvd, Atlantic City, NJ 08401",
};

const CARDS = [
  {
    img: '/retailers/parking.png', title: 'Parking',
    body: "On-site self-parking is available in Harrah's connected garage, with valet at the main entrance. Rates are set by the resort and subject to change, so check Harrah's parking info before you arrive.",
  },
  {
    img: '/retailers/air.png', title: 'By Air',
    body: "Atlantic City International Airport (ACY) is about 12 miles away — roughly a 20-minute drive — served by American, Allegiant, and Breeze Airways. Philadelphia International (PHL), about an hour west, offers the widest range of flights. Taxis and rideshare run from both.",
  },
  {
    img: '/retailers/transit.png', title: 'Public Transit & Jitney',
    body: "Take the NJ Transit Atlantic City Rail Line to the Atlantic City Rail Terminal, then hop the free AC Jitney shuttle to the casinos — it meets the trains. The Atlantic City Jitney (Routes 2 & 3) also serves Harrah's for $3 each way; pay cash or use the Jitney Surfer app. Dispatch: (609) 415-8060.",
  },
  {
    img: '/retailers/taxi.png', title: 'Taxi & Ride Share',
    body: "Uber, Lyft, and taxis serve Harrah's directly. Pick-up and drop-off are at the main resort entrance off Harrah's Blvd in the Marina District.",
  },
  {
    img: '/retailers/tourist.png', title: 'Tourist Info',
    body: "Making a weekend of it? Atlantic City has the Boardwalk, the beach, dining, and nightlife minutes away. Plan your trip at Visit Atlantic City.",
    link: { label: 'Visit Atlantic City', url: 'https://www.visitatlanticcity.com/' },
  },
];

export default function GettingHere() {
  const { data } = useQuery({ queryKey: ['show-info'], queryFn: () => api('/show-info') });
  const show = data?.showInfo;
  const venueName = show?.venue || VENUE.name;
  const address = show?.address || VENUE.address;
  const mapUrl = `https://maps.google.com/maps?q=${encodeURIComponent(address)}&z=15&output=embed`;
  const directionsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;

  const slides = [{ id: 0, image_url: '/retailers/hero-gettinghere.png', title: 'Getting Here', subtitle: "Everything you need to reach For The Fans Fest at Harrah's Resort Atlantic City.", cta_url: '/become-an-exhibitor', cta_label: 'Plan Your Visit' }];

  return (
    <div>
      <HeroCarousel slides={slides} fallbackTitle="Getting Here" />

      <div className="section container">
        <div className="info-row">
          <div>
            <h2 className="glow" style={{ marginTop: 0 }}>Location</h2>
            <p><strong>{venueName}</strong></p>
            <p className="muted">{address}</p>
            <p className="muted">Marina District</p>
            <a className="btn" href={directionsUrl} target="_blank" rel="noopener">Get Directions</a>
          </div>
          <div className="card" style={{ padding: 0, overflow: 'hidden', minHeight: 300 }}>
            <iframe
              title={`Map of ${venueName}`}
              src={mapUrl}
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
              style={{ border: 0, width: '100%', height: '100%', minHeight: 300 }}
              allowFullScreen
            />
          </div>
        </div>
      </div>

      <div className="section container">
        <h2 className="glow" style={{ textAlign: 'center' }}>Directions &amp; Parking</h2>
        <div className="grid cols-3" style={{ marginTop: 16 }}>
          {CARDS.map((c) => (
            <div className="card" key={c.title} style={{ padding: 0, overflow: 'hidden' }}>
              <img src={c.img} alt={c.title} style={{ width: '100%', display: 'block' }} />
              <div style={{ padding: 20 }}>
                <h3 style={{ marginTop: 0 }}>{c.title}</h3>
                <p className="muted">{c.body}</p>
                {c.link && <a href={c.link.url} target="_blank" rel="noopener">{c.link.label} →</a>}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
