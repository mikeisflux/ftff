import { useMemo, useState, useRef } from 'react';
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

export default function FloorMap({ selectable = false, value = [], onChange, tablePricing = null }) {
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

  const selectedBooths = MAP.booths.filter((b) => selected.has(b.id));
  // Each selected spot is a flat-priced booth space (10'x8'). Extra tables
  // within a space are a separate add-on handled on the application form.
  const n = selectedBooths.length;
  const total = tablePricing ? n * tablePricing.perBoothCents : 0;

  // Hover/tap popup showing which guest is at a taken table.
  const wrapRef = useRef(null);
  const [guestPop, setGuestPop] = useState(null);
  const showGuest = (e, id) => {
    const srv = byLabel[id];
    if (!srv?.guest_name || !wrapRef.current) return;
    const r = wrapRef.current.getBoundingClientRect();
    setGuestPop({
      name: srv.guest_name, headshot: srv.guest_headshot, knownFor: srv.guest_known_for,
      x: e.clientX - r.left, y: e.clientY - r.top,
    });
  };

  return (
    <div className="floormap" ref={wrapRef}>
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
            const guestName = byLabel[b.id]?.guest_name;
            return (
              <g key={b.id}>
                <rect
                  x={fx(b.x_ft)} y={fy(b.y_ft)} width={b.w_ft * SX} height={b.h_ft * SY}
                  rx="2" fill={fillFor(b)}
                  stroke="rgba(0,0,0,.35)" strokeWidth="0.7"
                  className={`floormap-booth${clickable ? ' is-clickable' : ''}${locked ? ' is-locked' : ''}${guestName ? ' has-guest' : ''}`}
                  role={selectable ? 'button' : 'img'}
                  tabIndex={clickable ? 0 : -1}
                  aria-pressed={selectable ? selected.has(b.id) : undefined}
                  aria-label={`Table ${b.id.toUpperCase()}, ${b.price_tier}, ${guestName ? `${guestName} appearing here` : locked ? 'not available for selection' : st}`}
                  onClick={(e) => { if (guestName) showGuest(e, b.id); else toggle(b.id); }}
                  onMouseMove={guestName ? (e) => showGuest(e, b.id) : undefined}
                  onMouseLeave={guestName ? () => setGuestPop(null) : undefined}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(b.id); } }}
                >
                  <title>{`${b.id.toUpperCase()} · ${b.price_tier} · faces ${b.facing} · ${guestName || (locked ? 'not available' : st)}`}</title>
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
                <strong>{n} booth space{n > 1 ? 's' : ''} selected{tablePricing ? ` — ${money(total)}` : ''}</strong>
                {tablePricing && (
                  <div className="muted" style={{ fontSize: '.82rem', marginTop: 2 }}>
                    Each booth space is {money(tablePricing.perBoothCents)} (10′×8′, table + 2 chairs). Extra tables for a space are added on your application.
                  </div>
                )}
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
            <thead><tr><th>Table</th><th>Tier</th><th>Status</th>{selectable && <th /> }</tr></thead>
            <tbody>
              {MAP.booths.map((b) => {
                const st = stateOf(b.id);
                const clickable = canSelect(b.id);
                return (
                  <tr key={b.id}>
                    <td>{b.id.toUpperCase()}</td>
                    <td>{b.price_tier}</td>
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

      {guestPop && (
        <div className="floormap-guestpop" style={{ left: guestPop.x + 14, top: guestPop.y + 14 }}>
          {guestPop.headshot && <img src={guestPop.headshot} alt="" />}
          <div>
            <strong>{guestPop.name}</strong>
            {guestPop.knownFor && <div className="muted" style={{ fontSize: '.8rem' }}>{guestPop.knownFor}</div>}
          </div>
        </div>
      )}
    </div>
  );
}
