import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api.js';

// Public guests grid + category filter pages (§7 Guests). Category pages are
// filtered views of the same endpoint. Empty categories show an honest empty
// state rather than placeholder tiles.
const CATEGORY_LABELS = {
  celebrities: 'Celebrities',
  comic_creators: 'Comic Creators',
  cosplayers: 'Cosplayers',
};

export default function Guests({ category }) {
  // `category` is passed for fixed category routes; /all-guests passes none.
  const label = category ? CATEGORY_LABELS[category] : 'All Guests';
  const qs = category ? `?category=${encodeURIComponent(category)}` : '';
  const { data, isLoading } = useQuery({
    queryKey: ['guests', category || 'all'],
    queryFn: () => api(`/guests${qs}`),
  });
  const guests = data?.guests ?? [];

  return (
    <div className="section container">
      <h1 className="glow">{label}</h1>
      {isLoading ? (
        <p className="muted">Loading…</p>
      ) : guests.length === 0 ? (
        <p className="muted">No guests have been announced in this category yet — check back soon.</p>
      ) : (
        <div className="grid cols-4">
          {guests.map((g) => (
            <div className="card" key={g.id}>
              {g.headshot_url && (
                <img src={g.headshot_url} alt={g.name} style={{ width: '100%', borderRadius: 8 }} />
              )}
              <h3 style={{ margin: '8px 0 0' }}>{g.name}</h3>
              <p className="muted">{g.known_for}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
