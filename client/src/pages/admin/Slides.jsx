import { useEffect, useState, useCallback } from 'react';
import { api, uploadFile } from '../../lib/api.js';
import Reorderable from '../../components/Reorderable.jsx';

const blank = { title: '', subtitle: '', image_url: '', cta_label: '', cta_url: '', is_active: true };

// Hero slider manager (§13): CRUD + image upload + drag-to-reorder.
export default function Slides() {
  const [slides, setSlides] = useState([]);
  const [form, setForm] = useState(blank);
  const [editingId, setEditingId] = useState(null);
  const [msg, setMsg] = useState('');

  const load = useCallback(async () => setSlides((await api('/admin/slides')).slides), []);
  useEffect(() => { load(); }, [load]);

  async function save(e) {
    e.preventDefault();
    setMsg('');
    try {
      const body = { ...form, title: form.title || null, subtitle: form.subtitle || null, cta_label: form.cta_label || null, cta_url: form.cta_url || null };
      if (editingId) await api(`/admin/slides/${editingId}`, { method: 'PUT', body });
      else await api('/admin/slides', { method: 'POST', body });
      setForm(blank); setEditingId(null); await load();
    } catch (err) { setMsg(err.data?.details?.[0]?.message || err.message); }
  }
  async function onUpload(file) {
    try { const { url } = await uploadFile('/admin/uploads', file); setForm((f) => ({ ...f, image_url: url })); }
    catch (err) { setMsg(err.message); }
  }
  async function del(id) { await api(`/admin/slides/${id}`, { method: 'DELETE' }); await load(); }
  async function reorder(orderedIds) { await api('/admin/slides/reorder', { method: 'POST', body: { orderedIds } }); }

  return (
    <div>
      <h1 className="glow">Hero Slides</h1>
      {msg && <p style={{ color: 'var(--color-danger)' }}>{msg}</p>}
      <form className="card" onSubmit={save} style={{ marginBottom: 16 }}>
        <h3>{editingId ? 'Edit slide' : 'Add slide'}</h3>
        <div className="grid cols-3">
          <div><label>Title</label><input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} /></div>
          <div><label>CTA label</label><input value={form.cta_label} onChange={(e) => setForm((f) => ({ ...f, cta_label: e.target.value }))} /></div>
          <div><label>CTA URL</label><input value={form.cta_url} onChange={(e) => setForm((f) => ({ ...f, cta_url: e.target.value }))} /></div>
        </div>
        <label>Subtitle</label>
        <input value={form.subtitle} onChange={(e) => setForm((f) => ({ ...f, subtitle: e.target.value }))} />
        <label>Image <span className="muted" style={{ fontWeight: 400 }}>(optional — leave blank, with no title, to show the logo)</span></label>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input value={form.image_url} onChange={(e) => setForm((f) => ({ ...f, image_url: e.target.value }))} placeholder="https://… or upload (optional)" />
          <input type="file" accept="image/*" onChange={(e) => e.target.files[0] && onUpload(e.target.files[0])} style={{ width: 'auto' }} />
        </div>
        {form.image_url && <img src={form.image_url} alt="" style={{ maxHeight: 80, marginTop: 8, borderRadius: 8 }} />}
        <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
          <button className="btn">{editingId ? 'Save' : 'Add'}</button>
          {editingId && <button type="button" className="btn secondary" onClick={() => { setEditingId(null); setForm(blank); }}>Cancel</button>}
        </div>
      </form>

      <h3>Slides (drag to reorder)</h3>
      <Reorderable items={slides} onReorder={reorder} render={(s) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {s.image_url && <img src={s.image_url} alt="" style={{ height: 44, borderRadius: 6 }} />}
          <div style={{ flex: 1 }}><strong>{s.title || '(untitled)'}</strong> {!s.is_active && <span className="muted">· hidden</span>}</div>
          <button className="btn secondary" onClick={() => { setEditingId(s.id); setForm({ title: s.title || '', subtitle: s.subtitle || '', image_url: s.image_url, cta_label: s.cta_label || '', cta_url: s.cta_url || '', is_active: s.is_active }); }}>Edit</button>
          <button className="btn secondary" onClick={() => del(s.id)}>Delete</button>
        </div>
      )} />
    </div>
  );
}
