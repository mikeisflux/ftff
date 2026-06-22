import { useEffect, useState, useCallback } from 'react';
import { api, uploadFile } from '../../lib/api.js';

// Full CRUD for ticket types (§13). Mirrors the store Products editor: a single
// Add/Edit form at the top, and each existing type has an Edit button that loads
// its full, fresh record into the form — so saves always send complete values
// (no stale/partial inline state, no accidental price reset).
const blank = { code: '', name: '', price: '40.00', description: '', is_digital: false, quantity_total: '', is_active: true, sort_order: 0, image_url: '' };
const toCents = (d) => Math.round(Number(d || 0) * 100);
const toDollars = (c) => (Number(c || 0) / 100).toFixed(2);

export default function TicketTypesAdmin() {
  const [types, setTypes] = useState([]);
  const [form, setForm] = useState(blank);
  const [editingId, setEditingId] = useState(null);
  const [msg, setMsg] = useState('');

  const load = useCallback(async () => setTypes((await api('/admin/ticket-types')).ticketTypes), []);
  useEffect(() => { load(); }, [load]);

  function startEdit(t) {
    setEditingId(t.id);
    setForm({
      code: t.code,
      name: t.name,
      price: toDollars(t.price_cents),
      description: t.description || '',
      is_digital: t.is_digital,
      quantity_total: t.quantity_total == null ? '' : String(t.quantity_total),
      is_active: t.is_active,
      sort_order: t.sort_order ?? 0,
      image_url: t.image_url || '',
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  const cancelEdit = () => { setEditingId(null); setForm(blank); };

  async function save(e) {
    e.preventDefault();
    setMsg('');
    const body = {
      name: form.name,
      description: form.description || null,
      price_cents: toCents(form.price),
      is_digital: form.is_digital,
      quantity_total: form.quantity_total === '' ? null : Number(form.quantity_total),
      is_active: form.is_active,
      sort_order: Number(form.sort_order) || 0,
      image_url: form.image_url || null,
    };
    try {
      if (editingId) {
        await api(`/admin/ticket-types/${editingId}`, { method: 'PUT', body });
      } else {
        await api('/admin/ticket-types', { method: 'POST', body: {
          ...body, code: form.code.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_'),
        } });
      }
      cancelEdit();
      await load();
      setMsg('Saved.');
    } catch (err) { setMsg(err.data?.details?.[0]?.message || err.message); }
  }

  async function uploadImage(file) {
    setMsg('');
    try { const { url } = await uploadFile('/admin/uploads', file); setForm((f) => ({ ...f, image_url: url })); }
    catch (err) { setMsg(err.message); }
  }

  async function del(t) {
    setMsg('');
    if (!window.confirm(`Delete ticket type "${t.name}"?`)) return;
    try { await api(`/admin/ticket-types/${t.id}`, { method: 'DELETE' }); if (editingId === t.id) cancelEdit(); await load(); }
    catch (err) { setMsg(err.data?.code === 'in_use' ? err.message : (err.message || 'Delete failed')); }
  }

  return (
    <div>
      <h1 className="glow">Ticket Types</h1>
      {msg && <p className="muted">{msg}</p>}

      <form className="card" onSubmit={save} style={{ marginBottom: 20 }}>
        <h3>{editingId ? `Edit ticket type` : 'Add ticket type'}</h3>
        <div className="grid cols-4">
          <div>
            <label>Code (id)</label>
            <input value={form.code} onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))} placeholder="vip" required disabled={!!editingId} title={editingId ? 'Code cannot be changed' : undefined} />
          </div>
          <div><label>Name</label><input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="VIP Pass" required /></div>
          <div><label>Price ($)</label><input type="number" step="0.01" min="0" value={form.price} onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))} /></div>
          <div><label>Inventory (blank = ∞)</label><input type="number" min="0" value={form.quantity_total} onChange={(e) => setForm((f) => ({ ...f, quantity_total: e.target.value }))} /></div>
        </div>
        <label>Description</label>
        <input value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
        <div className="grid cols-4" style={{ marginTop: 10, alignItems: 'end' }}>
          <div><label>Sort order</label><input type="number" value={form.sort_order} onChange={(e) => setForm((f) => ({ ...f, sort_order: e.target.value }))} /></div>
          <div>
            <label>Tile image</label>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              {form.image_url && <img src={form.image_url} alt="" style={{ height: 40, borderRadius: 6 }} />}
              <label className="btn secondary" style={{ cursor: 'pointer', margin: 0 }}>Upload
                <input type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => { if (e.target.files[0]) uploadImage(e.target.files[0]); e.target.value = ''; }} />
              </label>
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 18, marginTop: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <label style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}><input type="checkbox" style={{ width: 'auto' }} checked={form.is_digital} onChange={(e) => setForm((f) => ({ ...f, is_digital: e.target.checked }))} /> Digital (Virtual Con access)</label>
          <label style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}><input type="checkbox" style={{ width: 'auto' }} checked={form.is_active} onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))} /> Active</label>
          <span style={{ flex: 1 }} />
          <button className="btn">{editingId ? 'Save changes' : 'Add ticket type'}</button>
          {editingId && <button type="button" className="btn secondary" onClick={cancelEdit}>Cancel</button>}
        </div>
      </form>

      {types.map((t) => {
        const soldOut = t.quantity_total != null && t.quantity_sold >= t.quantity_total;
        const remaining = t.quantity_total == null ? '∞' : Math.max(0, t.quantity_total - t.quantity_sold);
        return (
          <div className="card" key={t.id} style={{ marginBottom: 10, display: 'flex', gap: 14, alignItems: 'center' }}>
            {t.image_url && <img src={t.image_url} alt="" style={{ height: 48, width: 48, objectFit: 'cover', borderRadius: 8 }} />}
            <div style={{ flex: 1 }}>
              <strong>{t.name}</strong> <span className="muted" style={{ fontSize: 12 }}>· {money(t.price_cents)} · {t.is_digital ? 'digital' : 'physical'}{!t.is_active ? ' · inactive' : ''}{soldOut ? ' · SOLD OUT' : ''}</span>
              <div className="muted" style={{ fontSize: 12 }}>
                code: {t.code} · sold: {t.quantity_sold} · inventory: {t.quantity_total == null ? '∞' : t.quantity_total} · remaining: {remaining}
              </div>
            </div>
            <button className="btn secondary" onClick={() => startEdit(t)}>Edit</button>
            <button className="btn secondary" onClick={() => del(t)}>Delete</button>
          </div>
        );
      })}
    </div>
  );
}

const money = (cents, cur = 'USD') =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: cur.toUpperCase() }).format((cents || 0) / 100);
