import { useParams, Link } from 'react-router-dom';
import HeroCarousel from '../components/HeroCarousel.jsx';
import { hotelBySlug, hotelImg } from '../content/hotels.js';

// Per-hotel detail page for Travel & Hotels. Photo gallery + details + booking.
export default function HotelDetail() {
  const { slug } = useParams();
  const h = hotelBySlug(slug);

  if (!h) {
    return (
      <div className="section container">
        <h1 className="glow">Hotel not found</h1>
        <p className="muted">See all <Link to="/travel-hotels">travel &amp; hotels</Link>.</p>
      </div>
    );
  }

  const slides = [{
    id: 0,
    image_url: hotelImg(h.img),
    title: h.name,
    subtitle: h.distance,
    cta_url: h.book,
    cta_label: 'Book Now',
  }];

  return (
    <div>
      <HeroCarousel slides={slides} fallbackTitle={h.name} />

      <div className="section container">
        <p className="muted"><Link to="/travel-hotels">← Travel &amp; Hotels</Link></p>

        <h1 style={{ marginTop: 8 }}>
          {h.name}
          {h.host && <span className="menu-cta" style={{ marginLeft: 10, fontSize: '.7rem', padding: '2px 10px' }}>HOST</span>}
        </h1>
        <p style={{ fontSize: '1.1rem', maxWidth: 820 }}>{h.description}</p>

        <div className="info-row" style={{ marginTop: 16 }}>
          <div>
            <p><strong>Location:</strong> {h.location}</p>
            <p><strong>Distance:</strong> {h.distance}</p>
            <p><strong>Tel:</strong> <a href={`tel:${h.tel.replace(/[^0-9]/g, '')}`}>{h.tel}</a></p>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
              <a className="btn" href={h.book} target="_blank" rel="noopener">Book Now</a>
              {h.photosUrl && <a className="btn secondary" href={h.photosUrl} target="_blank" rel="noopener">View photos on hotel site</a>}
            </div>
          </div>
          {h.amenities?.length > 0 && (
            <div>
              <h3 style={{ marginTop: 0 }}>Highlights</h3>
              <ul>{h.amenities.map((a) => <li key={a}>{a}</li>)}</ul>
            </div>
          )}
        </div>

        {h.gallery?.length > 0 && (
          <section style={{ marginTop: 32 }}>
            <h2>Photos</h2>
            <div className="hotel-gallery">
              {h.gallery.map((src, i) => (
                <img key={i} src={hotelImg(src)} alt={`${h.name} ${i + 1}`} loading="lazy" />
              ))}
            </div>
            <p className="muted" style={{ marginTop: 8, fontSize: '.85rem' }}>
              Photos are placeholders. See the hotel&rsquo;s own site for current images, or
              ask us to swap in licensed media-kit photos.
            </p>
          </section>
        )}

        <p className="muted" style={{ marginTop: 28 }}>
          Want news on guests, tickets, and any official room blocks? <Link to="/sign-up">Sign up for updates</Link>.
        </p>
      </div>
    </div>
  );
}
