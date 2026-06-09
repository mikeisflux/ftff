import { useEffect, useState, useCallback } from 'react';
import { api } from '../../lib/api.js';

// Full CRUD for ticket types (§13). Prices entered in dollars; five are seeded
// by default but admins can add/remove their own (VIP, weekend, kids, etc.).
const blank = { code: '', name: '', price: '40.00', description: '', is_digital: false, quantity_total: '', is_active: true };
const toCents = (d) => Math.round(Number(d || 0) * 100);
const toDollars = (c) => (Number(c || 0) / 100).toFixed(2);

export default function TicketTypesAdmin() {
  const [types, setTypes] = useState([]);
  const [form, setForm] = useState(blank);
  const [msg, setMsg] = useState('');

  const load = useCallback(async () => setTypes((await api('/admin/ticket-types')).ticketTypes), []);
  useEffect(() => { load(); }, [load]);

  async function create(e) {
    e.preventDefault();
    setMsg('');
    try {
      await api('/admin/ticket-types', { method: 'POST', body: {
        code: form.code.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_'),
        name: form.name, description: form.description || null,
        price_cents: toCents(form.price), is_digital: form.is_digital,
        quantity_total: form.quantity_total === '' ? null : Number(form.quantity_total),
        is_active: form.is_active,
      } });
      setForm(blank); await load();
    } catch (err) { setMsg(err.data?.details?.[0]?.message || err.message); }
  }

  async function save(t) {
    setMsg('');
    try {
      await api(`/admin/ticket-types/${t.id}`, { method: 'PUT', body: {
        name: t.name, description: t.description, price_cents: toCents(t._price),
        is_digital: t.is_digital,
        quantity_total: t.quantity_total === '' || t.quantity_total == null ? null : Number(t.quantity_total),
        is_active: t.is_active, sort_order: t.sort_order,
      } });
      setMsg(`Saved ${t.name}.`); await load();
    } catch (err) { setMsg(err.message); }
  }

  async function del(t) {
    setMsg('');
    if (!window.confirm(`Delete ticket type "${t.name}"?`)) return;
    try { await api(`/admin/ticket-types/${t.id}`, { method: 'DELETE' }); await load(); }
    catch (err) { setMsg(err.data?.code === 'in_use' ? err.message : (err.message || 'Delete failed')); }
  }

  const set = (id, k, v) => setTypes((arr) => arr.map((t) => (t.id === id ? { ...t, [k]: v } : t)));

  return (
    <div>
      <h1 className="glow">Ticket Types</h1>
      {msg && <p className="muted">{msg}</p>}

      <form className="card" onSubmit={create} style={{ marginBottom: 20 }}>
        <h3>Add ticket type</h3>
        <div className="grid cols-4">
          <div><label>Code (id)</label><input value={form.code} onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))} placeholder="vip" required /></div>
          <div><label>Name</label><input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="VIP Pass" required /></div>
          <div><label>Price ($)</label><input type="number" step="0.01" min="0" value={form.price} onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))} /></div>
          <div><label>Inventory (blank = ∞)</label><input type="number" value={form.quantity_total} onChange={(e) => setForm((f) => ({ ...f, quantity_total: e.target.value }))} /></div>
        </div>
        <label>Description</label>
        <input value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
        <div style={{ display: 'flex', gap: 18, marginTop: 10, alignItems: 'center' }}>
          <label style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}><input type="checkbox" style={{ width: 'auto' }} checked={form.is_digital} onChange={(e) => setForm((f) => ({ ...f, is_digital: e.target.checked }))} /> Digital (Virtual Con access)</label>
          <label style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}><input type="checkbox" style={{ width: 'auto' }} checked={form.is_active} onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))} /> Active</label>
          <button className="btn">Add ticket type</button>
        </div>
      </form>

      {types.map((t) => (
        <div className="card" key={t.id} style={{ marginBottom: 10 }}>
          <div className="grid cols-4" style={{ alignItems: 'end' }}>
            <div><label>Name</label><input value={t.name} onChange={(e) => set(t.id, 'name', e.target.value)} /></div>
            <div><label>Price ($)</label><input type="number" step="0.01" min="0" value={t._price ?? toDollars(t.price_cents)} onChange={(e) => set(t.id, '_price', e.target.value)} /></div>
            <div><label>Inventory (blank = ∞)</label><input type="number" value={t.quantity_total ?? ''} onChange={(e) => set(t.id, 'quantity_total', e.target.value)} /></div>
            <div><label>Sort</label><input type="number" value={t.sort_order} onChange={(e) => set(t.id, 'sort_order', Number(e.target.value))} /></div>
          </div>
          <label>Description</label><input value={t.description || ''} onChange={(e) => set(t.id, 'description', e.target.value)} />
          <div style={{ display: 'flex', gap: 18, alignItems: 'center', marginTop: 10, flexWrap: 'wrap' }}>
            <span className="muted" style={{ fontSize: 12 }}>code: {t.code} · sold: {t.quantity_sold}</span>
            <label style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}><input type="checkbox" style={{ width: 'auto' }} checked={t.is_digital} onChange={(e) => set(t.id, 'is_digital', e.target.checked)} /> Digital</label>
            <label style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}><input type="checkbox" style={{ width: 'auto' }} checked={t.is_active} onChange={(e) => set(t.id, 'is_active', e.target.checked)} /> Active</label>
            <span style={{ flex: 1 }} />
            <button className="btn" onClick={() => save(t)}>Save</button>
            <button className="btn secondary" onClick={() => del(t)}>Delete</button>
          </div>
        </div>
      ))}
    </div>
  );
}
