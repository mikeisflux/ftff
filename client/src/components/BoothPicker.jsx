import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api.js';
import { money } from '../lib/exhibitorPricing.js';

const STATUS_COLOR = {
  available: 'var(--color-primary)',
  held: '#f59e0b',
  sold: 'var(--color-muted)',
  blocked: 'var(--color-muted)',
};

// Interactive booth picker over the floor-plan image. Available booths are
// selectable; held/sold/blocked are greyed. Calls onSelect(booth).
export default function BoothPicker({ selectedId, onSelect }) {
  const { data, isLoading } = useQuery({ queryKey: ['booths'], queryFn: () => api('/booths') });
  const booths = data?.booths ?? [];
  const floorplanUrl = data?.floorplanUrl;

  if (isLoading) return <p className="muted">Loading floor plan…</p>;
  if (booths.length === 0) return <p className="muted">The exhibitor floor plan will be published soon.</p>;

  return (
    <>
      <div
        className="floorplan"
        style={{
          position: 'relative', width: '100%', aspectRatio: '16 / 9',
          borderRadius: 'var(--radius)', overflow: 'hidden',
          background: floorplanUrl
            ? `url(${floorplanUrl}) center/cover`
            : 'repeating-linear-gradient(45deg, color-mix(in srgb, var(--color-surface) 90%, transparent), color-mix(in srgb, var(--color-surface) 90%, transparent) 20px, color-mix(in srgb, var(--color-surface) 80%, transparent) 20px, color-mix(in srgb, var(--color-surface) 80%, transparent) 40px)',
          border: '1px solid color-mix(in srgb, var(--color-primary) 30%, transparent)',
        }}
      >
        {booths.map((b) => {
          const isAvail = b.status === 'available';
          return (
            <button
              key={b.id}
              type="button"
              disabled={!isAvail}
              onClick={() => isAvail && onSelect(b)}
              title={`${b.label} — ${money(b.price_cents)} (${b.status})`}
              style={{
                position: 'absolute',
                left: `${b.pos_x * 100}%`, top: `${b.pos_y * 100}%`,
                width: `${b.width * 100}%`, height: `${b.height * 100}%`,
                background: `color-mix(in srgb, ${STATUS_COLOR[b.status]} ${isAvail ? 45 : 65}%, transparent)`,
                border: `2px solid ${STATUS_COLOR[b.status]}`,
                borderRadius: 6, color: '#fff', fontWeight: 700,
                cursor: isAvail ? 'pointer' : 'not-allowed',
                boxShadow: selectedId === b.id ? `0 0 16px ${STATUS_COLOR[b.status]}` : 'none',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              {b.label}
            </button>
          );
        })}
      </div>
      <div className="floor-legend" style={{ display: 'flex', gap: 16, marginTop: 12, flexWrap: 'wrap' }}>
        {['available', 'held', 'sold'].map((s) => (
          <span key={s} className="muted" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <i style={{ width: 14, height: 14, background: STATUS_COLOR[s], borderRadius: 3, display: 'inline-block' }} /> {s}
          </span>
        ))}
      </div>
    </>
  );
}
