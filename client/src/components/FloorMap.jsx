import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api.js';
import MAP from '../content/floormap.json';

// Interactive Wildwood Ballroom table map (§ floor plan). Geometry comes from
// the approved floormap.json (feet → px via the supplied formula); live
// availability comes from the server (/booths, authoritative). Supports view
// mode (public floor plan) and select mode (exhibitor application multi-select),
// with hover tooltips, zoom, keyboard, and a screen-reader list fallback.

const R = MAP.render;
const OX = R.origin_px.x;
const OY = R.origin_px.y;
const SX = R.scale_x_px_per_ft;
const SY = R.scale_y_px_per_ft;
const fx = (ft) => OX + ft * SX;
const fy = (ft) => OY + ft * SY;
const money = (c) => `$${Math.round((c || 0) / 100)}`;

export default function FloorMap({ selectable = false, value = [], onChange }) {
  const { data, isLoading } = useQuery({ queryKey: ['booths'], queryFn: () => api('/booths') });
  const [zoom, setZoom] = useState(1);
  const [showList, setShowList] = useState(false);

  const byLabel = useMemo(() => {
    const m = {};
    for (const b of data?.booths ?? []) m[b.label] = b;
    return m;
  }, [data]);

  const selected = useMemo(() => new Set(value), [value]);
  // Row A (the featured front row) is not selectable by applicants.
  const LOCKED = useMemo(() => new Set(MAP.booths.filter((b) => b.row === 'a').map((b) => b.id)), []);

  const serverStatus = (id) => byLabel[id]?.status || 'available';
  const stateOf = (id) => (selected.has(id) ? 'selected' : serverStatus(id));
  const canSelect = (id) => selectable && !LOCKED.has(id) && serverStatus(id) === 'available';

  const toggle = (id) => {
    if (!canSelect(id) && !selected.has(id)) return;
    const next = new Set(selected);
    if (next.has(id)) next.delete(id); else next.add(id);
    onChange?.([...next]);
  };

  const fillFor = (b) => {
    switch (stateOf(b.id)) {
      case 'selected': return 'var(--color-success)';
      case 'held': return '#f59e0b';
      case 'sold': return 'var(--color-muted)';
      case 'blocked': return '#444';
      default:
        if (LOCKED.has(b.id)) return 'color-mix(in srgb, var(--color-accent) 55%, #555)';
        return b.price_tier === 'featured' ? 'var(--color-accent)' : 'var(--color-primary)';
    }
  };

  const priceOf = (id) => byLabel[id]?.price_cents;
  const selectedBooths = MAP.booths.filter((b) => selected.has(b.id));
  const total = selectedBooths.reduce((s, b) => s + (priceOf(b.id) || 0), 0);

  return (
    <div className="floormap">
      <div className="floormap-toolbar">
        <div className="floormap-legend">
          <span><i style={{ background: 'var(--color-primary)' }} /> Standard</span>
          <span><i style={{ background: 'var(--color-accent)' }} /> Featured</span>
          {selectable && <span><i style={{ background: 'var(--color-success)' }} /> Selected</span>}
          <span><i style={{ background: '#f59e0b' }} /> Held</span>
          <span><i style={{ background: 'var(--color-muted)' }} /> Sold</span>
        </div>
        <div className="floormap-zoom">
          <button type="button" onClick={() => setZoom((z) => Math.max(1, z - 0.5))} aria-label="Zoom out">−</button>
          <button type="button" onClick={() => setZoom(1)} aria-label="Reset zoom">⤢</button>
          <button type="button" onClick={() => setZoom((z) => Math.min(4, z + 0.5))} aria-label="Zoom in">+</button>
          <button type="button" className="btn secondary" onClick={() => setShowList((s) => !s)}>
            {showList ? 'Hide list' : 'List view'}
          </button>
        </div>
      </div>

      {isLoading && <p className="muted">Loading floor plan…</p>}

      <div className="floormap-scroll">
        <svg
          className="floormap-svg"
          viewBox={R.viewBox}
          style={{ width: `${zoom * 100}%` }}
          role="group"
          aria-label="Exhibitor table map"
        >
          <rect
            x={R.hall_rect_px.x} y={R.hall_rect_px.y}
            width={R.hall_rect_px.w} height={R.hall_rect_px.h}
            fill="none" stroke="color-mix(in srgb, var(--color-primary) 40%, transparent)" strokeWidth="2"
          />
          {MAP.zones.map((z) => {
            const [x, y, w, h] = z.rect_ft;
            return (
              <rect key={z.id} x={fx(x)} y={fy(y)} width={w * SX} height={h * SY}
                fill="color-mix(in srgb, var(--color-surface) 70%, transparent)" />
            );
          })}
          {MAP.rooms.map((rm) => (
            <g key={rm.id}>
              <polygon
                points={rm.polygon_ft.map(([x, y]) => `${fx(x)},${fy(y)}`).join(' ')}
                fill="color-mix(in srgb, var(--color-secondary) 18%, transparent)"
                stroke="color-mix(in srgb, var(--color-secondary) 50%, transparent)"
              />
              <text x={fx(rm.polygon_ft[0][0]) + 12} y={fy(rm.polygon_ft[0][1]) + 26} className="floormap-room-label">
                {rm.name}
              </text>
            </g>
          ))}
          {MAP.booths.map((b) => {
            const st = stateOf(b.id);
            const clickable = canSelect(b.id);
            const locked = LOCKED.has(b.id);
            const price = priceOf(b.id);
            return (
              <g key={b.id}>
                <rect
                  x={fx(b.x_ft)} y={fy(b.y_ft)} width={b.w_ft * SX} height={b.h_ft * SY}
                  rx="2" fill={fillFor(b)}
                  stroke="rgba(0,0,0,.35)" strokeWidth="0.7"
                  className={`floormap-booth${clickable ? ' is-clickable' : ''}${locked ? ' is-locked' : ''}`}
                  role={selectable ? 'button' : 'img'}
                  tabIndex={clickable ? 0 : -1}
                  aria-pressed={selectable ? selected.has(b.id) : undefined}
                  aria-label={`Table ${b.id.toUpperCase()}, ${b.price_tier}${price ? `, ${money(price)}` : ''}, ${locked ? 'not available for selection' : st}`}
                  onClick={() => toggle(b.id)}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(b.id); } }}
                >
                  <title>{`${b.id.toUpperCase()} · ${b.price_tier}${price ? ` · ${money(price)}` : ''} · faces ${b.facing} · ${locked ? 'not available' : st}`}</title>
                </rect>
                <text x={fx(b.x_ft) + (b.w_ft * SX) / 2} y={fy(b.y_ft) + (b.h_ft * SY) / 2 + 3}
                  className="floormap-booth-label">{b.id.toUpperCase()}</text>
              </g>
            );
          })}
        </svg>
      </div>

      {selectable && (
        <div className="floormap-tray">
          {selectedBooths.length === 0
            ? <span className="muted">Tap available tables to select them.</span>
            : (
              <>
                <strong>{selectedBooths.length} table{selectedBooths.length > 1 ? 's' : ''} selected — {money(total)}</strong>
                <div className="floormap-chips">
                  {selectedBooths.map((b) => (
                    <button key={b.id} type="button" className="chip" onClick={() => toggle(b.id)}>
                      {b.id.toUpperCase()} ✕
                    </button>
                  ))}
                </div>
              </>
            )}
        </div>
      )}

      {showList && (
        <div className="floormap-listview">
          <table>
            <thead><tr><th>Table</th><th>Tier</th><th>Price</th><th>Status</th>{selectable && <th /> }</tr></thead>
            <tbody>
              {MAP.booths.map((b) => {
                const st = stateOf(b.id);
                const clickable = canSelect(b.id);
                return (
                  <tr key={b.id}>
                    <td>{b.id.toUpperCase()}</td>
                    <td>{b.price_tier}</td>
                    <td>{priceOf(b.id) ? money(priceOf(b.id)) : '—'}</td>
                    <td>{st}</td>
                    {selectable && (
                      <td>{clickable || selected.has(b.id)
                        ? <button type="button" className="btn secondary" onClick={() => toggle(b.id)}>{selected.has(b.id) ? 'Remove' : 'Select'}</button>
                        : <span className="muted">—</span>}</td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
