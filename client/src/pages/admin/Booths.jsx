import { useEffect, useState, useCallback } from 'react';
import { api } from '../../lib/api.js';

const money = (cents) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format((cents || 0) / 100);
const STATUS_COLOR = { available: 'var(--color-primary)', held: '#f59e0b', sold: 'var(--color-muted)', blocked: 'var(--color-muted)' };
const blank = { label: '', zone: '', price_cents: 50000, pos_x: 0.1, pos_y: 0.1, width: 0.15, height: 0.15 };

// Admin booth manager (§9): define/edit booths over the floor-plan, with a live
// overlay preview. Floor-plan image URL is managed in Settings (vendor.floorplan_url).
export default function Booths() {
  const [booths, setBooths] = useState([]);
  const [floorplanUrl, setFloorplanUrl] = useState(null);
  const [form, setForm] = useState(blank);
  const [editingId, setEditingId] = useState(null);
  const [msg, setMsg] = useState('');

  const load = useCallback(async () => {
    const pub = await api('/booths');
    setFloorplanUrl(pub.floorplanUrl);
    const { booths } = await api('/admin/booths');
    setBooths(booths);
  }, []);
  useEffect(() => { load(); }, [load]);

  const setNum = (k) => (e) => setForm((f) => ({ ...f, [k]: Number(e.target.value) }));
  const setStr = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function save(e) {
    e.preventDefault();
    setMsg('');
    const body = { ...form, zone: form.zone || null };
    try {
      if (editingId) await api(`/admin/booths/${editingId}`, { method: 'PUT', body });
      else await api('/admin/booths', { method: 'POST', body });
      setForm(blank); setEditingId(null);
      await load();
    } catch (err) {
      setMsg(err.data?.details?.[0]?.message || err.message);
    }
  }

  async function act(id, method, suffix = '') {
    await api(`/admin/booths/${id}${suffix}`, { method }).catch((e) => setMsg(e.message));
    await load();
  }

  function edit(b) {
    setEditingId(b.id);
    setForm({ label: b.label, zone: b.zone || '', price_cents: b.price_cents, pos_x: b.pos_x, pos_y: b.pos_y, width: b.width, height: b.height });
  }

  return (
    <div>
      <h1 className="glow">Floor Plan &amp; Booths</h1>
      {!floorplanUrl && (
        <p className="muted">Tip: set <code>vendor.floorplan_url</code> in Settings to show your floor-plan image behind the booths.</p>
      )}

      {/* Live overlay preview (incl. the booth being edited) */}
      <div style={{ position: 'relative', width: '100%', aspectRatio: '16 / 9', borderRadius: 'var(--radius)', overflow: 'hidden',
        background: floorplanUrl ? `url(${floorplanUrl}) center/cover` : 'color-mix(in srgb, var(--color-surface) 85%, transparent)',
        border: '1px solid color-mix(in srgb, var(--color-primary) 30%, transparent)', marginBottom: 16 }}>
        {booths.map((b) => (
          <div key={b.id} style={{ position: 'absolute', left: `${b.pos_x * 100}%`, top: `${b.pos_y * 100}%`, width: `${b.width * 100}%`, height: `${b.height * 100}%`,
            border: `2px solid ${STATUS_COLOR[b.status]}`, background: `color-mix(in srgb, ${STATUS_COLOR[b.status]} 35%, transparent)`,
            borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 12, fontWeight: 700 }}>{b.label}</div>
        ))}
        {form.label && (
          <div style={{ position: 'absolute', left: `${form.pos_x * 100}%`, top: `${form.pos_y * 100}%`, width: `${form.width * 100}%`, height: `${form.height * 100}%`,
            border: '2px dashed var(--color-accent)', borderRadius: 6 }} />
        )}
      </div>

      <form className="card" onSubmit={save} style={{ marginBottom: 16 }}>
        <h3>{editingId ? 'Edit booth' : 'Add booth'}</h3>
        <div className="grid cols-4">
          <div><label>Label</label><input value={form.label} onChange={setStr('label')} required /></div>
          <div><label>Zone</label><input value={form.zone} onChange={setStr('zone')} /></div>
          <div><label>Price (cents)</label><input type="number" value={form.price_cents} onChange={setNum('price_cents')} min={0} /></div>
          <div />
          {['pos_x', 'pos_y', 'width', 'height'].map((k) => (
            <div key={k}><label>{k} (0–1)</label><input type="number" step="0.01" min="0" max="1" value={form[k]} onChange={setNum(k)} /></div>
          ))}
        </div>
        {msg && <p style={{ color: 'var(--color-danger)' }}>{msg}</p>}
        <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
          <button className="btn">{editingId ? 'Save changes' : 'Add booth'}</button>
          {editingId && <button type="button" className="btn secondary" onClick={() => { setEditingId(null); setForm(blank); }}>Cancel</button>}
        </div>
      </form>

      <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr style={{ textAlign: 'left' }}><th style={{ padding: 10 }}>Label</th><th>Zone</th><th>Price</th><th>Status</th><th>Actions</th></tr></thead>
          <tbody>
            {booths.map((b) => (
              <tr key={b.id} style={{ borderTop: '1px solid rgba(255,255,255,.08)' }}>
                <td style={{ padding: 10 }}>{b.label}</td>
                <td>{b.zone}</td>
                <td>{money(b.price_cents)}</td>
                <td style={{ color: STATUS_COLOR[b.status] }}>{b.status}</td>
                <td style={{ display: 'flex', gap: 6, padding: 10, flexWrap: 'wrap' }}>
                  <button className="btn secondary" onClick={() => edit(b)}>Edit</button>
                  {b.status === 'blocked'
                    ? <button className="btn secondary" onClick={() => act(b.id, 'POST', '/release')}>Release</button>
                    : b.status !== 'sold' && <button className="btn secondary" onClick={() => act(b.id, 'POST', '/block')}>Block</button>}
                  {b.status !== 'sold' && <button className="btn secondary" onClick={() => act(b.id, 'DELETE')}>Delete</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
