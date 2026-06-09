import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api.js';

const LETTERS = ['All', '#', ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')];

function firstLetter(name) {
  const c = (name || '').trim().charAt(0).toUpperCase();
  return /[A-Z]/.test(c) ? c : '#';
}

// Past Exhibitors directory — A–Z + category filters with a two-column listing.
// Structure is in place now; the list fills in once past_exhibitors is populated.
export default function PastExhibitors() {
  const { data } = useQuery({ queryKey: ['past-exhibitors'], queryFn: () => api('/exhibitor/past') });
  const all = data?.exhibitors ?? [];

  const [letter, setLetter] = useState('All');
  const [cats, setCats] = useState([]);

  const categories = useMemo(
    () => [...new Set(all.map((e) => e.category).filter(Boolean))].sort(),
    [all],
  );

  const filtered = all
    .filter((e) => letter === 'All' || firstLetter(e.company) === letter)
    .filter((e) => cats.length === 0 || cats.includes(e.category))
    .sort((a, b) => a.company.localeCompare(b.company));

  const mid = Math.ceil(filtered.length / 2);
  const columns = [filtered.slice(0, mid), filtered.slice(mid)];

  function toggleCat(c) {
    setCats((prev) => (prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]));
  }

  return (
    <div className="section container">
      <h1 className="glow">Past Exhibitors</h1>

      {/* A–Z filter */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, margin: '16px 0' }}>
        {LETTERS.map((l) => (
          <button
            key={l}
            onClick={() => setLetter(l)}
            className={l === letter ? 'btn' : 'btn secondary'}
            style={{ padding: '4px 10px', minWidth: 36 }}
          >
            {l}
          </button>
        ))}
      </div>

      <div className="grid" style={{ gridTemplateColumns: '220px 1fr', gap: 28, alignItems: 'start' }}>
        {/* Category filter */}
        <aside>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ margin: 0 }}>Categories</h3>
            {cats.length > 0 && <button className="btn secondary" style={{ padding: '2px 8px' }} onClick={() => setCats([])}>Clear</button>}
          </div>
          {categories.length === 0 ? (
            <p className="muted" style={{ fontSize: '.9rem' }}>No categories yet.</p>
          ) : (
            categories.map((c) => (
              <label key={c} style={{ display: 'flex', gap: 8, alignItems: 'center', margin: '8px 0' }}>
                <input type="checkbox" checked={cats.includes(c)} onChange={() => toggleCat(c)} /> {c}
              </label>
            ))
          )}
        </aside>

        {/* Two-column company / stand listing */}
        <div>
          {filtered.length === 0 ? (
            <p className="muted">Our exhibitor directory will be published after the show. Check back soon!</p>
          ) : (
            <div className="grid info-row" style={{ marginBottom: 0 }}>
              {columns.map((col, i) => (
                <table key={i} style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ textAlign: 'left', borderBottom: '2px solid color-mix(in srgb, var(--color-primary) 40%, transparent)' }}>
                      <th style={{ padding: '8px 0' }}>Company</th>
                      <th style={{ textAlign: 'right' }}>Stand</th>
                    </tr>
                  </thead>
                  <tbody>
                    {col.map((e, n) => (
                      <tr key={n} style={{ borderBottom: '1px solid rgba(255,255,255,.08)' }}>
                        <td style={{ padding: '8px 0' }}>
                          {e.website ? <a href={e.website} target="_blank" rel="noopener">{e.company}</a> : e.company}
                        </td>
                        <td style={{ textAlign: 'right' }} className="muted">{e.stand || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
