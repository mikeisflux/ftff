import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api.js';

const money = (cents, cur = 'USD') =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: cur.toUpperCase() }).format((cents || 0) / 100);

const STATUS_COLOR = {
  available: 'var(--color-primary)',
  held: '#f59e0b',
  sold: 'var(--color-muted)',
  blocked: 'var(--color-muted)',
};

// Public vendor floor (§9): interactive booth picker over the floor-plan image.
// Available booths are selectable; held/sold/blocked are greyed. Selecting opens
// a checkout panel that soft-holds the booth and sends the vendor to Stripe.
export default function FloorPlan() {
  const { data } = useQuery({ queryKey: ['booths'], queryFn: () => api('/booths') });
  const booths = data?.booths ?? [];
  const floorplanUrl = data?.floorplanUrl;

  const [selected, setSelected] = useState(null);
  const [vendor, setVendor] = useState({ name: '', email: '' });
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState('');

  async function reserve(e) {
    e.preventDefault();
    setStatus('submitting');
    setError('');
    try {
      const { url } = await api('/checkout/booth', {
        method: 'POST',
        body: { boothId: selected.id, vendor },
      });
      window.location.assign(url);
    } catch (err) {
      setStatus('error');
      setError(
        err.data?.code === 'booth_unavailable' ? 'Sorry, that booth was just taken.'
        : err.data?.code === 'stripe_unconfigured' ? 'Booth sales aren’t open yet.'
        : err.message || 'Could not reserve the booth.',
      );
    }
  }

  return (
    <div className="section container">
      <h1 className="glow">Floor Plan</h1>
      {booths.length === 0 ? (
        <p className="muted">The exhibitor floor plan will be published soon.</p>
      ) : (
        <>
          <p className="muted">Select an available booth to reserve it.</p>
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
                  onClick={() => isAvail && setSelected(b)}
                  title={`${b.label} — ${money(b.price_cents)} (${b.status})`}
                  style={{
                    position: 'absolute',
                    left: `${b.pos_x * 100}%`, top: `${b.pos_y * 100}%`,
                    width: `${b.width * 100}%`, height: `${b.height * 100}%`,
                    background: `color-mix(in srgb, ${STATUS_COLOR[b.status]} ${isAvail ? 45 : 65}%, transparent)`,
                    border: `2px solid ${STATUS_COLOR[b.status]}`,
                    borderRadius: 6, color: '#fff', fontWeight: 700,
                    cursor: isAvail ? 'pointer' : 'not-allowed',
                    boxShadow: selected?.id === b.id ? `0 0 16px ${STATUS_COLOR[b.status]}` : 'none',
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

          {selected && (
            <div className="card" style={{ marginTop: 20, maxWidth: 460 }}>
              <h3>Reserve booth {selected.label}</h3>
              <p className="muted">{selected.zone} · {money(selected.price_cents)}</p>
              <form onSubmit={reserve}>
                <label>Business / vendor name</label>
                <input value={vendor.name} onChange={(e) => setVendor((v) => ({ ...v, name: e.target.value }))} required />
                <label>Email</label>
                <input type="email" value={vendor.email} onChange={(e) => setVendor((v) => ({ ...v, email: e.target.value }))} required />
                {status === 'error' && <p style={{ color: 'var(--color-danger)' }}>{error}</p>}
                <div style={{ marginTop: 14, display: 'flex', gap: 8 }}>
                  <button className="btn" disabled={status === 'submitting'}>
                    {status === 'submitting' ? 'Reserving…' : `Reserve · ${money(selected.price_cents)}`}
                  </button>
                  <button type="button" className="btn secondary" onClick={() => setSelected(null)}>Cancel</button>
                </div>
                <p className="muted" style={{ fontSize: '.8rem', marginTop: 8 }}>
                  The booth is held while you complete secure Stripe checkout.
                </p>
              </form>
            </div>
          )}
        </>
      )}
    </div>
  );
}
