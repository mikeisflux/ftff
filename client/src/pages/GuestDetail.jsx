import { useParams, Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api.js';
import { useCart } from '../store/CartContext.jsx';

// Per-guest detail page (§7). One template for every guest: celebrities get the
// PRICING block + Autographs/Photo Ops tiles (shown only when pricing is set),
// while comic creators and others lead with the bio + social links. Managed from
// the admin Guest Tile Manager.

const DISCLAIMER_LINES = [
  'Guests subject to cancellation or schedule change, due to professional commitments.',
  'Although most guests are available for the duration of the event, due to limited availability some guests are only available for a portion of the event, i.e. a single day.',
  'Appearance day(s) will be posted on the website as soon as we know.',
  'All events have limited seating capacities and are offered on a first come, first served basis.',
];

const SOCIAL_LABELS = {
  imdb: 'IMDb', website: 'Website', twitter: 'X', x: 'X',
  instagram: 'Instagram', facebook: 'Facebook', youtube: 'YouTube', tiktok: 'TikTok',
};

const money = (cents) => `$${(cents / 100).toFixed(2)}`;

export default function GuestDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const cart = useCart();
  const { data, isLoading, error } = useQuery({
    queryKey: ['guest', id],
    queryFn: () => api(`/guests/${id}`),
    retry: false,
  });

  if (isLoading) {
    return <div className="section container"><p className="muted">Loading…</p></div>;
  }
  if (error || !data?.guest) {
    return (
      <div className="section container">
        <h1 className="glow">Guest not found</h1>
        <p className="muted">This guest may no longer be appearing. <Link to="/all-guests">See all guests</Link>.</p>
      </div>
    );
  }

  const g = data.guest;
  const days = Array.isArray(g.appearance_days) ? g.appearance_days : [];
  const hasPricing =
    g.autograph_cents != null || g.autograph_premium_cents != null || g.photo_op_cents != null;
  const socials = g.socials && typeof g.socials === 'object' ? g.socials : {};
  const socialEntries = Object.entries(socials).filter(([, url]) => url);
  const purchase = g.purchase || {};

  const buy = (item) => {
    cart.add({ variantId: item.variantId, title: item.title, unitPriceCents: item.priceCents, image: g.headshot_url }, 1);
    navigate('/cart');
  };

  return (
    <div className="section container guest-detail">
      <header className="guest-detail-head">
        <h1 className="glow guest-name">{g.name}</h1>
        {g.known_for && <p className="guest-knownfor">{g.known_for}</p>}
        {days.length > 0 && (
          <p className="guest-appearing"><strong>Appearing:</strong> {days.join(', ')}</p>
        )}
      </header>

      <div className="guest-detail-grid">
        <div className="guest-photo">
          {g.headshot_url
            ? <img src={g.headshot_url} alt={g.name} />
            : <div className="guest-photo-placeholder muted">No photo</div>}
        </div>

        <div className="guest-detail-info">
          {hasPricing && (
            <section className="guest-pricing">
              <h2 className="glow">Pricing</h2>
              {g.autograph_cents != null && (
                <p><strong>Autograph:</strong> {money(g.autograph_cents)} — 8x10</p>
              )}
              {g.autograph_premium_cents != null && (
                <p><strong>Autograph Premium:</strong> {money(g.autograph_premium_cents)}</p>
              )}
              {g.photo_op_cents != null && (
                <p><strong>Photo Op:</strong> {money(g.photo_op_cents)}</p>
              )}
              <p className="muted">Prices subject to change.</p>
            </section>
          )}

          <section className="guest-info">
            <h2 className="glow">Guest Info</h2>
            {g.bio_url && (
              <p>
                <a className="guest-bio-link" href={g.bio_url} target="_blank" rel="noreferrer">
                  Check out their bio
                </a>
              </p>
            )}
            {g.bio && (
              <div className="guest-bio">
                {g.bio.split('\n').map((p) => p.trim()).filter(Boolean).map((p, i) => <p key={i}>{p}</p>)}
              </div>
            )}
            {socialEntries.length > 0 && (
              <div className="guest-socials">
                {socialEntries.map(([k, url]) => (
                  <a key={k} href={url} target="_blank" rel="noreferrer" className="btn secondary">
                    {SOCIAL_LABELS[k] || k}
                  </a>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>

      <section className="guest-disclaimers">
        <h3>Disclaimers</h3>
        {DISCLAIMER_LINES.map((line, i) => <p key={i} className="muted">{line}</p>)}
      </section>

      {hasPricing && (
        <section className="ap-section">
          <h2 className="glow" style={{ textAlign: 'center' }}>Autographs and Photo Ops</h2>
          <div className="ap-tiles">
            <div className="ap-tile">
              {purchase.autograph ? (
                <>
                  <button type="button" className="ap-tile-box" onClick={() => buy(purchase.autograph)}>Autographs</button>
                  <button type="button" className="ap-buy ap-buy-btn" onClick={() => buy(purchase.autograph)}>Buy Now</button>
                </>
              ) : (
                <>
                  <Link to="/autographs" className="ap-tile-box">Autographs</Link>
                  <Link to="/autographs" className="ap-buy">Buy Now</Link>
                </>
              )}
            </div>
            <div className="ap-tile">
              {purchase.photoOp ? (
                <>
                  <button type="button" className="ap-tile-box" onClick={() => buy(purchase.photoOp)}>Photo Ops</button>
                  <button type="button" className="ap-buy ap-buy-btn" onClick={() => buy(purchase.photoOp)}>Buy Now</button>
                </>
              ) : (
                <>
                  <Link to="/photo-ops" className="ap-tile-box">Photo Ops</Link>
                  <Link to="/photo-ops" className="ap-buy">Buy Now</Link>
                </>
              )}
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
