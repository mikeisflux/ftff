import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api.js';
import { formatDateRange } from '../lib/dates.js';
import { PRICES, money } from '../lib/exhibitorPricing.js';
import HeroCarousel from '../components/HeroCarousel.jsx';

const HERO_SLIDES = ['/retailers/hero-1.png', '/retailers/hero-2.png', '/retailers/hero-3.png'];

// Alternating image/text row (mirrors the FAN EXPO retailer/artist layout).
function InfoRow({ image, alt, flip, children }) {
  const img = <img src={image} alt={alt} style={{ width: '100%', borderRadius: 'var(--radius)', display: 'block' }} />;
  return (
    <div className="info-row">
      {flip ? <div>{children}</div> : img}
      {flip ? img : <div>{children}</div>}
    </div>
  );
}

function Faq({ q, a }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ borderBottom: '1px solid rgba(255,255,255,.12)' }}>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        style={{ width: '100%', textAlign: 'left', background: 'none', border: 0, color: 'inherit', padding: '18px 0', fontSize: '1.05rem', fontWeight: 600, cursor: 'pointer', display: 'flex', justifyContent: 'space-between', gap: 12 }}
      >
        {q} <span>{open ? '▲' : '▼'}</span>
      </button>
      {open && <p className="muted" style={{ paddingBottom: 18, marginTop: 0 }}>{a}</p>}
    </div>
  );
}

// Shared informational page for exhibitor categories (Retailers, Artist Alley):
// branded hero slider + Show Info + Pricing + Order Forms + FAQ, all funneling
// to the Become an Exhibitor application.
export default function ExhibitorInfoPage({ title, tagline, intro, faqs = [] }) {
  const { data } = useQuery({ queryKey: ['show-info'], queryFn: () => api('/show-info') });
  const show = data?.showInfo;

  const slides = HERO_SLIDES.map((image_url, i) => ({
    id: i,
    image_url,
    title,
    subtitle: tagline,
    cta_url: '/become-an-exhibitor',
    cta_label: 'Become an Exhibitor',
  }));

  return (
    <div>
      <HeroCarousel slides={slides} fallbackTitle={title} fallbackSubtitle={tagline} />

      <div className="section container">
        {intro && <p style={{ fontSize: '1.1rem', maxWidth: 820 }}>{intro}</p>}

        {/* Show info */}
        <InfoRow image="/retailers/info.png" alt="Show information">
          <h2 className="glow" style={{ marginTop: 0 }}>Show Info</h2>
          <p>Mark your calendars for <strong>For The Fans Fest</strong>.</p>
          {show && (
            <ul style={{ lineHeight: 1.9 }}>
              {show.starts_on && <li><strong>When:</strong> {formatDateRange(show.starts_on, show.ends_on)}</li>}
              {show.venue && <li><strong>Where:</strong> {show.venue}{show.address ? <><br />{show.address}</> : null}</li>}
            </ul>
          )}
        </InfoRow>

        {/* Pricing */}
        <InfoRow image="/retailers/pricing.png" alt="Pricing" flip>
          <h2 className="glow" style={{ marginTop: 0 }}>Pricing</h2>
          <p>Let’s talk numbers.</p>
          <ul style={{ lineHeight: 1.9 }}>
            <li><strong>Booth — {money(PRICES.boothBase)} each</strong> · includes one table + 2 chairs.</li>
            <li><strong>Additional tables — {money(PRICES.extraTable)} each</strong> (limited availability).</li>
            <li><strong>Hotel rooms</strong> — from {money(PRICES.hotel.night3)} to {money(PRICES.hotel.night2)} per night.</li>
            <li><strong>Banquet</strong> — {money(PRICES.banquetPerPerson)} per person (limited seats).</li>
          </ul>
          <p className="muted" style={{ fontSize: '.9rem' }}>
            A deposit (50% of your booth + 60% of add-ons) reserves your space; the balance is due before the show.
          </p>
        </InfoRow>

        {/* Order forms / apply */}
        <InfoRow image="/retailers/orderforms.png" alt="Application">
          <h2 className="glow" style={{ marginTop: 0 }}>Ready to apply?</h2>
          <p>
            Complete the exhibitor application, agree to the terms, pick your booth on the floor plan, and pay your
            deposit or in full — all in one place.
          </p>
          <Link to="/become-an-exhibitor" className="btn">Become an Exhibitor</Link>
        </InfoRow>
      </div>

      {/* FAQ */}
      {faqs.length > 0 && (
        <div className="section container">
          <h2 className="glow">FAQ</h2>
          <div style={{ maxWidth: 880 }}>
            {faqs.map((f) => <Faq key={f.q} {...f} />)}
          </div>
        </div>
      )}
    </div>
  );
}
