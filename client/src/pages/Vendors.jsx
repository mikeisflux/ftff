import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api.js';

// Public vendor directory. Confirmed exhibitors (added by admin or auto-created
// when an application is approved). A–Z jump bar + autocomplete search by name.
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

export default function Vendors() {
  const { data, isLoading } = useQuery({ queryKey: ['vendors'], queryFn: () => api('/vendors') });
  const [q, setQ] = useState('');
  const vendors = data?.vendors ?? [];

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return s ? vendors.filter((v) => v.name.toLowerCase().includes(s)) : vendors;
  }, [q, vendors]);

  const groups = useMemo(() => {
    const m = {};
    for (const v of filtered) {
      const c = (v.name[0] || '#').toUpperCase();
      const key = /[A-Z]/.test(c) ? c : '#';
      (m[key] ||= []).push(v);
    }
    return m;
  }, [filtered]);

  const present = new Set(Object.keys(groups));
  const jump = (letter) => {
    const el = document.getElementById(`vendor-letter-${letter}`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div className="section container vendors-page">
      <h1 className="glow">Vendors</h1>
      <p className="muted">Our confirmed exhibitors and their booth numbers.</p>

      <input
        type="search"
        className="vendor-search"
        placeholder="Search vendors by name…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        list="vendor-names"
        autoComplete="off"
        aria-label="Search vendors"
      />
      <datalist id="vendor-names">
        {vendors.map((v) => <option key={v.id} value={v.name} />)}
      </datalist>

      <nav className="vendor-azbar" aria-label="Jump to letter">
        {ALPHABET.map((L) => (
          <button key={L} type="button" className="az" disabled={!present.has(L)} onClick={() => jump(L)}>
            {L}
          </button>
        ))}
      </nav>

      {isLoading ? (
        <p className="muted">Loading…</p>
      ) : filtered.length === 0 ? (
        <p className="muted">{vendors.length === 0 ? 'Vendors will be announced soon — check back.' : 'No vendors match your search.'}</p>
      ) : (
        [...ALPHABET, '#'].filter((L) => groups[L]?.length).map((L) => (
          <section key={L} id={`vendor-letter-${L}`} className="vendor-group">
            <h2 className="glow">{L}</h2>
            <ul className="vendor-list">
              {groups[L].map((v) => (
                <li key={v.id}>
                  <span className="vendor-name">
                    {v.website ? <a href={v.website} target="_blank" rel="noreferrer">{v.name}</a> : v.name}
                    {v.category && <span className="muted vendor-cat"> · {v.category}</span>}
                  </span>
                  {v.booth_number && <span className="vendor-booth">Booth {v.booth_number}</span>}
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}
