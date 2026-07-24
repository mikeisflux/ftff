import { useEffect, useState, useCallback } from 'react';
import { api, uploadFileWithProgress } from '../../lib/api.js';
import Reorderable from '../../components/Reorderable.jsx';

const blank = { title: '', subtitle: '', image_url: '', cta_label: '', cta_url: '', page_slug: '', is_active: true };
const isVideo = (u) => /\.(mp4|webm|mov)(\?|$)/i.test(u || '');

// Hero slider manager (§13): CRUD + image upload + drag-to-reorder + per-page assignment.
export default function Slides() {
  const [slides, setSlides] = useState([]);
  const [pages, setPages] = useState([]);
  const [form, setForm] = useState(blank);
  const [editingId, setEditingId] = useState(null);
  const [msg, setMsg] = useState('');
  const [progress, setProgress] = useState(null); // null | 0..1 | 'done'

  const load = useCallback(async () => {
    setSlides((await api('/admin/slides')).slides);
    try { setPages((await api('/admin/pages')).pages || []); } catch { /* optional */ }
  }, []);
  useEffect(() => { load(); }, [load]);

  async function save(e) {
    e.preventDefault();
    setMsg('');
    try {
      const body = { ...form, title: form.title || null, subtitle: form.subtitle || null, cta_label: form.cta_label || null, cta_url: form.cta_url || null, page_slug: form.page_slug || null };
      if (editingId) await api(`/admin/slides/${editingId}`, { method: 'PUT', body });
      else await api('/admin/slides', { method: 'POST', body });
      setForm(blank); setEditingId(null); await load();
    } catch (err) { setMsg(err.data?.details?.[0]?.message || err.message); }
  }
  async function onUpload(file) {
    setMsg(''); setProgress(0);
    try {
      const { url } = await uploadFileWithProgress('/admin/uploads', file, { onProgress: setProgress });
      setForm((f) => ({ ...f, image_url: url }));
      setProgress('done');
      setTimeout(() => setProgress((p) => (p === 'done' ? null : p)), 2500);
    } catch (err) { setMsg(err.message); setProgress(null); }
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
        <label>Assign to page <span className="muted" style={{ fontWeight: 400 }}>(blank = Homepage; or a page slug like getting-here)</span></label>
        <input list="page-slugs" value={form.page_slug} onChange={(e) => setForm((f) => ({ ...f, page_slug: e.target.value.trim() }))} placeholder="Homepage" />
        <datalist id="page-slugs">
          <option value="">Homepage</option>
          {pages.map((p) => <option key={p.slug} value={p.slug}>{p.title || p.slug}</option>)}
        </datalist>
        <label>Image or video <span className="muted" style={{ fontWeight: 400 }}>(optional — image or short MP4/WebM; leave blank, with no title, to show the logo)</span></label>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input value={form.image_url} onChange={(e) => setForm((f) => ({ ...f, image_url: e.target.value }))} placeholder="https://… or upload (optional)" />
          <input type="file" accept="image/*,video/mp4,video/webm,video/quicktime" disabled={typeof progress === 'number'} onChange={(e) => e.target.files[0] && onUpload(e.target.files[0])} style={{ width: 'auto' }} />
        </div>
        {progress != null && (
          <div style={{ marginTop: 8 }}>
            {progress === 'done' ? (
              <span style={{ color: 'var(--color-success)', fontWeight: 700 }}>✓ Upload complete</span>
            ) : (
              <>
                <div style={{ height: 8, borderRadius: 999, background: 'color-mix(in srgb, var(--color-muted) 25%, transparent)', overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${Math.round(progress * 100)}%`, background: 'linear-gradient(90deg, var(--color-primary), var(--color-secondary), var(--color-accent))', transition: 'width .15s' }} />
                </div>
                <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                  {progress >= 0.999 ? 'Processing…' : `Uploading… ${Math.round(progress * 100)}%`}
                </div>
              </>
            )}
          </div>
        )}
        {form.image_url && (isVideo(form.image_url)
          ? <video ref={(el) => { if (el) { el.muted = true; el.play?.().catch(() => {}); } }} src={form.image_url} muted autoPlay loop playsInline style={{ maxHeight: 100, marginTop: 8, borderRadius: 8, display: 'block' }} />
          : <img src={form.image_url} alt="" style={{ maxHeight: 80, marginTop: 8, borderRadius: 8 }} />)}
        <label style={{ display: 'inline-flex', gap: 8, alignItems: 'center', marginTop: 12 }}>
          <input type="checkbox" style={{ width: 'auto' }} checked={form.is_active} onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))} />
          Active <span className="muted" style={{ fontWeight: 400 }}>— unchecked hides it from the site</span>
        </label>
        <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
          <button className="btn">{editingId ? 'Save' : 'Add'}</button>
          {editingId && <button type="button" className="btn secondary" onClick={() => { setEditingId(null); setForm(blank); }}>Cancel</button>}
        </div>
      </form>

      <h3>Slides (drag to reorder)</h3>
      <Reorderable items={slides} onReorder={reorder} render={(s) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {s.image_url && (isVideo(s.image_url)
            ? <video src={s.image_url} muted style={{ height: 44, borderRadius: 6 }} />
            : <img src={s.image_url} alt="" style={{ height: 44, borderRadius: 6 }} />)}
          <div style={{ flex: 1 }}><strong>{s.title || '(untitled)'}</strong> <span className="muted">· {s.page_slug || 'Homepage'}</span> {!s.is_active && <span className="muted">· hidden</span>}</div>
          <button className="btn secondary" onClick={() => { setEditingId(s.id); setForm({ title: s.title || '', subtitle: s.subtitle || '', image_url: s.image_url, cta_label: s.cta_label || '', cta_url: s.cta_url || '', page_slug: s.page_slug || '', is_active: s.is_active }); }}>Edit</button>
          <button className="btn secondary" onClick={() => del(s.id)}>Delete</button>
        </div>
      )} />
    </div>
  );
}
