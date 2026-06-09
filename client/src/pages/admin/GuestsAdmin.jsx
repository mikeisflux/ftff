import { useEffect, useState, useCallback } from 'react';
import { api, uploadFile } from '../../lib/api.js';
import Reorderable from '../../components/Reorderable.jsx';

const CATEGORIES = ['celebrities', 'animation_voices', 'anime', 'gaming_stars', 'comic_creators', 'cosplayers', 'other'];
const blank = { name: '', known_for: '', bio: '', headshot_url: '', category: 'celebrities', is_featured: false, is_active: true };

// Guest Tile Manager (§13.2): upload a photo + write a bio -> it appears as a
// tile. Featured controls the 8 homepage tiles (server enforces the cap).
export default function GuestsAdmin() {
  const [guests, setGuests] = useState([]);
  const [form, setForm] = useState(blank);
  const [editingId, setEditingId] = useState(null);
  const [filter, setFilter] = useState('');
  const [msg, setMsg] = useState('');

  const load = useCallback(async () => setGuests((await api('/admin/guests')).guests), []);
  useEffect(() => { load(); }, [load]);

  const featuredCount = guests.filter((g) => g.is_featured).length;

  async function save(e) {
    e.preventDefault();
    setMsg('');
    try {
      const body = { ...form, known_for: form.known_for || null, bio: form.bio || null, headshot_url: form.headshot_url || null };
      if (editingId) await api(`/admin/guests/${editingId}`, { method: 'PUT', body });
      else await api('/admin/guests', { method: 'POST', body });
      setForm(blank); setEditingId(null); await load();
    } catch (err) { setMsg(err.message); }
  }
  async function onUpload(file) {
    try { const { url } = await uploadFile('/admin/uploads', file); setForm((f) => ({ ...f, headshot_url: url })); }
    catch (err) { setMsg(err.message); }
  }
  async function toggleFeatured(g) {
    try { await api(`/admin/guests/${g.id}`, { method: 'PUT', body: { ...g, is_featured: !g.is_featured } }); await load(); }
    catch (err) { setMsg(err.message); }
  }
  async function del(id) { if (window.confirm('Delete guest?')) { await api(`/admin/guests/${id}`, { method: 'DELETE' }); await load(); } }
  async function reorder(orderedIds) { await api('/admin/guests/reorder', { method: 'POST', body: { orderedIds } }); }

  const shown = filter ? guests.filter((g) => g.category === filter) : guests;

  return (
    <div>
      <h1 className="glow">Guest Tile Manager</h1>
      <p className="muted">Featured on homepage: {featuredCount}/8</p>
      {msg && <p style={{ color: 'var(--color-danger)' }}>{msg}</p>}

      <form className="card" onSubmit={save} style={{ marginBottom: 16 }}>
        <h3>{editingId ? 'Edit guest' : 'Add guest'}</h3>
        <div className="grid" style={{ gridTemplateColumns: '160px 1fr' }}>
          <div>
            {/* Live tile preview */}
            <div className="card" style={{ textAlign: 'center' }}>
              {form.headshot_url ? <img src={form.headshot_url} alt="" style={{ width: '100%', borderRadius: 8 }} /> : <div style={{ aspectRatio: '1', background: 'color-mix(in srgb, var(--color-surface) 80%, transparent)', borderRadius: 8, display: 'grid', placeItems: 'center' }} className="muted">No photo</div>}
              <strong>{form.name || 'Name'}</strong>
              <div className="muted" style={{ fontSize: 12 }}>{form.known_for}</div>
            </div>
            <input type="file" accept="image/*" onChange={(e) => e.target.files[0] && onUpload(e.target.files[0])} style={{ marginTop: 8 }} />
          </div>
          <div>
            <label>Name</label><input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} required />
            <label>Known for</label><input value={form.known_for} onChange={(e) => setForm((f) => ({ ...f, known_for: e.target.value }))} />
            <label>Category</label>
            <select value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}>{CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select>
            <label>Bio</label><textarea rows={3} value={form.bio} onChange={(e) => setForm((f) => ({ ...f, bio: e.target.value }))} />
            <label style={{ display: 'inline-flex', gap: 8, alignItems: 'center', marginTop: 8 }}>
              <input type="checkbox" style={{ width: 'auto' }} checked={form.is_featured} onChange={(e) => setForm((f) => ({ ...f, is_featured: e.target.checked }))} /> Featured (homepage)
            </label>
          </div>
        </div>
        <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
          <button className="btn">{editingId ? 'Save' : 'Add guest'}</button>
          {editingId && <button type="button" className="btn secondary" onClick={() => { setEditingId(null); setForm(blank); }}>Cancel</button>}
        </div>
      </form>

      <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
        <select value={filter} onChange={(e) => setFilter(e.target.value)} style={{ width: 220 }}>
          <option value="">All categories</option>
          {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      <Reorderable items={shown} onReorder={reorder} render={(g) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {g.headshot_url && <img src={g.headshot_url} alt="" style={{ height: 44, width: 44, objectFit: 'cover', borderRadius: 6 }} />}
          <div style={{ flex: 1 }}><strong>{g.name}</strong> <span className="muted">· {g.category}{!g.is_active ? ' · inactive' : ''}</span></div>
          <button className="btn secondary" onClick={() => toggleFeatured(g)}>{g.is_featured ? '★ Featured' : '☆ Feature'}</button>
          <button className="btn secondary" onClick={() => { setEditingId(g.id); setForm({ name: g.name, known_for: g.known_for || '', bio: g.bio || '', headshot_url: g.headshot_url || '', category: g.category, is_featured: g.is_featured, is_active: g.is_active }); }}>Edit</button>
          <button className="btn secondary" onClick={() => del(g.id)}>✕</button>
        </div>
      )} />
    </div>
  );
}
