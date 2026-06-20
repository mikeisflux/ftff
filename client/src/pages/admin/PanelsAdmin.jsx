import { useEffect, useState, useCallback } from 'react';
import { api } from '../../lib/api.js';

const DAYS = ['Friday', 'Saturday', 'Sunday'];
const blank = { title: '', day: 'Friday', start_time: '', end_time: '', location: '', presenter: '', description: '', sort_order: 0, is_active: true };

// Livestream panels manager — full CRUD for the /live-stream-panels schedule.
export default function PanelsAdmin() {
  const [panels, setPanels] = useState([]);
  const [form, setForm] = useState(blank);
  const [editingId, setEditingId] = useState(null);
  const [msg, setMsg] = useState('');

  const load = useCallback(async () => setPanels((await api('/admin/panels')).panels), []);
  useEffect(() => { load(); }, [load]);

  async function save(e) {
    e.preventDefault();
    setMsg('');
    try {
      const body = {
        title: form.title,
        day: form.day,
        start_time: form.start_time || null,
        end_time: form.end_time || null,
        location: form.location || null,
        presenter: form.presenter || null,
        description: form.description || null,
        sort_order: Number(form.sort_order) || 0,
        is_active: form.is_active,
      };
      if (editingId) await api(`/admin/panels/${editingId}`, { method: 'PUT', body });
      else await api('/admin/panels', { method: 'POST', body });
      setForm(blank); setEditingId(null); await load();
    } catch (err) { setMsg(err.message); }
  }
  function edit(p) {
    setEditingId(p.id);
    setForm({
      title: p.title, day: p.day, start_time: p.start_time || '', end_time: p.end_time || '',
      location: p.location || '', presenter: p.presenter || '', description: p.description || '',
      sort_order: p.sort_order ?? 0, is_active: p.is_active,
    });
  }
  async function del(id) { if (window.confirm('Delete panel?')) { await api(`/admin/panels/${id}`, { method: 'DELETE' }); await load(); } }

  return (
    <div>
      <h1 className="glow">Live Stream Panels</h1>
      <p className="muted">Shown on <code>/live-stream-panels</code>, grouped by day.</p>
      {msg && <p style={{ color: 'var(--color-danger)' }}>{msg}</p>}

      <form className="card" onSubmit={save} style={{ marginBottom: 16 }}>
        <h3>{editingId ? 'Edit panel' : 'Add panel'}</h3>
        <label>Title</label>
        <input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} required />
        <div className="grid" style={{ gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
          <div>
            <label>Day</label>
            <select value={form.day} onChange={(e) => setForm((f) => ({ ...f, day: e.target.value }))}>
              {DAYS.map((d) => <option key={d}>{d}</option>)}
            </select>
          </div>
          <div><label>Start time</label><input value={form.start_time} onChange={(e) => setForm((f) => ({ ...f, start_time: e.target.value }))} placeholder="2:00 PM" /></div>
          <div><label>End time</label><input value={form.end_time} onChange={(e) => setForm((f) => ({ ...f, end_time: e.target.value }))} placeholder="3:00 PM" /></div>
        </div>
        <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div><label>Presenter / guest(s)</label><input value={form.presenter} onChange={(e) => setForm((f) => ({ ...f, presenter: e.target.value }))} /></div>
          <div><label>Location / stage</label><input value={form.location} onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))} /></div>
        </div>
        <label>Description</label>
        <textarea rows={3} value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
        <div className="grid" style={{ gridTemplateColumns: '120px 1fr', gap: 10, alignItems: 'end' }}>
          <div><label>Sort order</label><input type="number" min="0" value={form.sort_order} onChange={(e) => setForm((f) => ({ ...f, sort_order: e.target.value }))} /></div>
          <label style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
            <input type="checkbox" style={{ width: 'auto' }} checked={form.is_active} onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))} /> Active (visible)
          </label>
        </div>
        <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
          <button className="btn">{editingId ? 'Save' : 'Add panel'}</button>
          {editingId && <button type="button" className="btn secondary" onClick={() => { setEditingId(null); setForm(blank); }}>Cancel</button>}
        </div>
      </form>

      {DAYS.map((day) => {
        const list = panels.filter((p) => p.day === day);
        if (list.length === 0) return null;
        return (
          <section key={day} style={{ marginBottom: 18 }}>
            <h3 className="glow">{day}</h3>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr style={{ textAlign: 'left' }}><th>Time</th><th>Title</th><th>Presenter</th><th></th></tr></thead>
              <tbody>
                {list.map((p) => (
                  <tr key={p.id} style={{ borderTop: '1px solid rgba(255,255,255,.08)' }}>
                    <td style={{ whiteSpace: 'nowrap' }}>{p.start_time || 'TBA'}{p.end_time ? `–${p.end_time}` : ''}</td>
                    <td>{p.title}{!p.is_active && <span className="muted"> · hidden</span>}</td>
                    <td className="muted">{p.presenter || '—'}</td>
                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <button className="btn secondary" onClick={() => edit(p)}>Edit</button>{' '}
                      <button className="btn secondary" onClick={() => del(p.id)}>✕</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        );
      })}
      {panels.length === 0 && <p className="muted">No panels yet — add one above.</p>}
    </div>
  );
}
