import { useEffect, useState, useCallback } from 'react';
import { api } from '../../lib/api.js';
import Reorderable from '../../components/Reorderable.jsx';

const blank = { parent_id: '', label: '', route: '', url: '', is_cta: false, opens_new_tab: false, is_active: true };

// Mega-menu builder (§7.0): top-level + child items, drag-to-reorder.
export default function NavBuilder() {
  const [items, setItems] = useState([]);
  const [form, setForm] = useState(blank);
  const [editingId, setEditingId] = useState(null);
  const [msg, setMsg] = useState('');

  const load = useCallback(async () => setItems((await api('/admin/nav')).items), []);
  useEffect(() => { load(); }, [load]);

  const tops = items.filter((i) => !i.parent_id);

  async function save(e) {
    e.preventDefault();
    setMsg('');
    const body = {
      parent_id: form.parent_id || null, label: form.label,
      route: form.url ? null : (form.route || null), url: form.url || null,
      is_cta: form.is_cta, opens_new_tab: form.opens_new_tab, is_active: form.is_active,
    };
    try {
      if (editingId) await api(`/admin/nav/${editingId}`, { method: 'PUT', body });
      else await api('/admin/nav', { method: 'POST', body });
      setForm(blank); setEditingId(null); await load();
    } catch (err) { setMsg(err.data?.details?.[0]?.message || err.message); }
  }
  async function del(id) { if (window.confirm('Delete nav item (and its children)?')) { await api(`/admin/nav/${id}`, { method: 'DELETE' }); await load(); } }
  async function reorder(orderedIds) { await api('/admin/nav/reorder', { method: 'POST', body: { orderedIds } }); }

  return (
    <div>
      <h1 className="glow">Navigation</h1>
      {msg && <p style={{ color: 'var(--color-danger)' }}>{msg}</p>}
      <form className="card" onSubmit={save} style={{ marginBottom: 16 }}>
        <h3>{editingId ? 'Edit item' : 'Add item'}</h3>
        <div className="grid cols-3">
          <div><label>Parent</label>
            <select value={form.parent_id} onChange={(e) => setForm((f) => ({ ...f, parent_id: e.target.value }))}>
              <option value="">— Top level —</option>
              {tops.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
            </select>
          </div>
          <div><label>Label</label><input value={form.label} onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))} required /></div>
          <div><label>Route (internal)</label><input value={form.route} onChange={(e) => setForm((f) => ({ ...f, route: e.target.value }))} placeholder="/buy-tickets" /></div>
          <div><label>or URL (external)</label><input value={form.url} onChange={(e) => setForm((f) => ({ ...f, url: e.target.value }))} placeholder="https://…" /></div>
          <div><label style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}><input type="checkbox" style={{ width: 'auto' }} checked={form.is_cta} onChange={(e) => setForm((f) => ({ ...f, is_cta: e.target.checked }))} /> CTA highlight</label></div>
          <div><label style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}><input type="checkbox" style={{ width: 'auto' }} checked={form.opens_new_tab} onChange={(e) => setForm((f) => ({ ...f, opens_new_tab: e.target.checked }))} /> New tab</label></div>
        </div>
        <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
          <button className="btn">{editingId ? 'Save' : 'Add'}</button>
          {editingId && <button type="button" className="btn secondary" onClick={() => { setEditingId(null); setForm(blank); }}>Cancel</button>}
        </div>
      </form>

      <h3>Menu (drag to reorder)</h3>
      <Reorderable items={items} onReorder={reorder} render={(n) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, paddingLeft: n.parent_id ? 24 : 0 }}>
          <span style={{ flex: 1 }}>{n.parent_id ? '↳ ' : ''}<strong>{n.label}</strong> <span className="muted">{n.route || n.url}{n.is_cta ? ' · CTA' : ''}{!n.is_active ? ' · hidden' : ''}</span></span>
          <button className="btn secondary" onClick={() => { setEditingId(n.id); setForm({ parent_id: n.parent_id || '', label: n.label, route: n.route || '', url: n.url || '', is_cta: n.is_cta, opens_new_tab: n.opens_new_tab, is_active: n.is_active }); }}>Edit</button>
          <button className="btn secondary" onClick={() => del(n.id)}>✕</button>
        </div>
      )} />
    </div>
  );
}
