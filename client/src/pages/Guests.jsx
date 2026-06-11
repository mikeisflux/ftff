import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api.js';
import HeroCarousel from '../components/HeroCarousel.jsx';

// Public guests grid (§7 Guests). The All Guests page groups by category; every
// listing is further split into tiers (Featured / Special / Also Appearing) with
// black divider tiles. Individual category pages lead with the main slider.
const CATEGORY_LABELS = {
  celebrities: 'Celebrities',
  comic_creators: 'Comic Creators',
  cosplayers: 'Cosplayers',
  other: 'Other Guests',
};
const CATEGORY_ORDER = ['celebrities', 'comic_creators', 'cosplayers', 'other'];

const TIER_LABELS = {
  featured: 'Featured Guests',
  special: 'Special Guests',
  also_appearing: 'Also Appearing',
};
const TIER_ORDER = ['featured', 'special', 'also_appearing'];

function days(appearance) {
  return Array.isArray(appearance) && appearance.length > 0 ? appearance.join(', ') : null;
}

function GuestTile({ g }) {
  const appearing = days(g.appearance_days);
  return (
    <Link to={`/guests/${g.id}`} className="card guest-tile">
      {g.headshot_url && <img src={g.headshot_url} alt={g.name} style={{ width: '100%', borderRadius: 8 }} />}
      <h3 style={{ margin: '8px 0 0' }}>{g.name}</h3>
      {g.known_for && <p className="muted" style={{ margin: '4px 0 0' }}>{g.known_for}</p>}
      {appearing && <p className="muted" style={{ margin: '6px 0 0', fontSize: '.85rem' }}>Appearing: {appearing}</p>}
    </Link>
  );
}

// Render one category's guests, split into tiers with a black divider per tier.
function TieredGrid({ guests }) {
  const items = [];
  for (const tier of TIER_ORDER) {
    const inTier = guests.filter((g) => (g.tier || 'featured') === tier);
    if (inTier.length === 0) continue;
    items.push(<div className="guest-divider" key={`div-${tier}`}>{TIER_LABELS[tier]}</div>);
    for (const g of inTier) items.push(<GuestTile key={g.id} g={g} />);
  }
  return <div className="grid cols-4">{items}</div>;
}

export default function Guests({ category }) {
  const label = category ? CATEGORY_LABELS[category] : 'All Guests';
  const qs = category ? `?category=${encodeURIComponent(category)}` : '';
  const { data, isLoading } = useQuery({
    queryKey: ['guests', category || 'all'],
    queryFn: () => api(`/guests${qs}`),
  });
  // The main slider on individual category pages reuses the admin-managed slides.
  const slidesQ = useQuery({ queryKey: ['slides'], queryFn: () => api('/slides'), enabled: Boolean(category) });

  const guests = data?.guests ?? [];

  if (isLoading) {
    return <div className="section container"><h1 className="glow">{label}</h1><p className="muted">Loading…</p></div>;
  }

  // Individual category page: main slider + that category's tiered listings.
  if (category) {
    return (
      <div>
        <HeroCarousel slides={slidesQ.data?.slides ?? []} fallbackTitle={label} />
        <div className="section container">
          <h1 className="glow">{label}</h1>
          {guests.length === 0
            ? <p className="muted">No guests have been announced in this category yet — check back soon.</p>
            : <TieredGrid guests={guests} />}
        </div>
      </div>
    );
  }

  // All Guests: a section per category, each with tier dividers.
  const byCategory = CATEGORY_ORDER
    .map((cat) => ({ cat, list: guests.filter((g) => g.category === cat) }))
    .filter(({ list }) => list.length > 0);

  return (
    <div className="section container">
      <h1 className="glow">All Guests</h1>
      {byCategory.length === 0 ? (
        <p className="muted">No guests have been announced yet — check back soon.</p>
      ) : (
        byCategory.map(({ cat, list }) => (
          <section key={cat} style={{ marginTop: 32 }}>
            <h2 className="glow" style={{ textAlign: 'center' }}>{CATEGORY_LABELS[cat]}</h2>
            <TieredGrid guests={list} />
          </section>
        ))
      )}
    </div>
  );
}
