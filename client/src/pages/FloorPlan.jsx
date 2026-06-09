import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '../lib/api.js';

const STATUS_COLOR = {
  available: 'var(--color-primary)',
  held: '#f59e0b',
  sold: 'var(--color-muted)',
  blocked: 'var(--color-muted)',
};

// Public floor plan (§9) — informational only. Booth purchasing lives in the
// Become an Exhibitor application; this page just shows the layout and links to it.
export default function FloorPlan() {
  const { data } = useQuery({ queryKey: ['booths'], queryFn: () => api('/booths') });
  const booths = data?.booths ?? [];
  const floorplanUrl = data?.floorplanUrl;

  return (
    <div className="section container">
      <h1 className="glow">Floor Plan</h1>
      {booths.length === 0 ? (
        <p className="muted">The exhibitor floor plan will be published soon.</p>
      ) : (
        <>
          <p className="muted">A look at the exhibitor hall layout. To reserve a booth, apply to become an exhibitor.</p>
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
            {booths.map((b) => (
              <div
                key={b.id}
                title={`${b.label} (${b.status})`}
                style={{
                  position: 'absolute',
                  left: `${b.pos_x * 100}%`, top: `${b.pos_y * 100}%`,
                  width: `${b.width * 100}%`, height: `${b.height * 100}%`,
                  background: `color-mix(in srgb, ${STATUS_COLOR[b.status]} 50%, transparent)`,
                  border: `2px solid ${STATUS_COLOR[b.status]}`,
                  borderRadius: 6, color: '#fff', fontWeight: 700,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
              >
                {b.label}
              </div>
            ))}
          </div>

          <div className="floor-legend" style={{ display: 'flex', gap: 16, marginTop: 12, flexWrap: 'wrap' }}>
            {['available', 'held', 'sold'].map((s) => (
              <span key={s} className="muted" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <i style={{ width: 14, height: 14, background: STATUS_COLOR[s], borderRadius: 3, display: 'inline-block' }} /> {s}
              </span>
            ))}
          </div>
        </>
      )}

      <div style={{ marginTop: 28, textAlign: 'center' }}>
        <Link to="/become-an-exhibitor" className="btn">Become an Exhibitor</Link>
      </div>
    </div>
  );
}
