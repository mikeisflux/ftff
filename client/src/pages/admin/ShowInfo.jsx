import { useEffect, useState } from 'react';
import { api } from '../../lib/api.js';

// Show info editor (§13): single-row venue/date/hours config.
export default function ShowInfo() {
  const [s, setS] = useState(null);
  const [msg, setMsg] = useState('');

  useEffect(() => { api('/admin/show-info').then((d) => setS(d.showInfo || {})).catch(() => {}); }, []);
  if (!s) return <div><h1 className="glow">Show Info</h1><p className="muted">Loading…</p></div>;

  const set = (k) => (e) => setS((x) => ({ ...x, [k]: e.target.value }));
  const hours = Array.isArray(s.hours_json) ? s.hours_json : [];
  const setHour = (i, k, v) => setS((x) => { const h = [...(x.hours_json || [])]; h[i] = { ...h[i], [k]: v }; return { ...x, hours_json: h }; });

  async function save(e) {
    e.preventDefault();
    setMsg('');
    try {
      await api('/admin/show-info', { method: 'PUT', body: {
        name: s.name, tagline: s.tagline, starts_on: s.starts_on, ends_on: s.ends_on,
        venue: s.venue, address: s.address, lat: s.lat ? Number(s.lat) : null, lng: s.lng ? Number(s.lng) : null,
        hours_json: hours,
      } });
      setMsg('Saved.');
    } catch (err) { setMsg(err.message); }
  }

  return (
    <div>
      <h1 className="glow">Show Info</h1>
      {msg && <p className="muted">{msg}</p>}
      <form className="card" onSubmit={save} style={{ maxWidth: 720 }}>
        <div className="grid cols-2" style={{ gridTemplateColumns: '1fr 1fr' }}>
          <div><label>Name</label><input value={s.name || ''} onChange={set('name')} /></div>
          <div><label>Tagline</label><input value={s.tagline || ''} onChange={set('tagline')} /></div>
          <div><label>Starts</label><input type="date" value={s.starts_on?.slice(0, 10) || ''} onChange={set('starts_on')} /></div>
          <div><label>Ends</label><input type="date" value={s.ends_on?.slice(0, 10) || ''} onChange={set('ends_on')} /></div>
          <div><label>Venue</label><input value={s.venue || ''} onChange={set('venue')} /></div>
          <div><label>Address</label><input value={s.address || ''} onChange={set('address')} /></div>
          <div><label>Lat</label><input value={s.lat ?? ''} onChange={set('lat')} /></div>
          <div><label>Lng</label><input value={s.lng ?? ''} onChange={set('lng')} /></div>
        </div>
        <h3 style={{ marginTop: 16 }}>Hours</h3>
        {hours.map((h, i) => (
          <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
            <input placeholder="Day" value={h.day || ''} onChange={(e) => setHour(i, 'day', e.target.value)} />
            <input placeholder="Open" value={h.open || ''} onChange={(e) => setHour(i, 'open', e.target.value)} />
            <input placeholder="Close" value={h.close || ''} onChange={(e) => setHour(i, 'close', e.target.value)} />
            <button type="button" className="btn secondary" onClick={() => setS((x) => ({ ...x, hours_json: hours.filter((_, j) => j !== i) }))}>✕</button>
          </div>
        ))}
        <button type="button" className="btn secondary" onClick={() => setS((x) => ({ ...x, hours_json: [...hours, { day: '', open: '', close: '' }] }))}>Add hour row</button>
        <div style={{ marginTop: 16 }}><button className="btn">Save</button></div>
      </form>
    </div>
  );
}
