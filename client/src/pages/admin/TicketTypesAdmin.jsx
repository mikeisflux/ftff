import { useEffect, useState, useCallback } from 'react';
import { api } from '../../lib/api.js';

// Ticket pricing/inventory editor (§13). The five types are fixed; edit price,
// description, inventory cap, and active state.
export default function TicketTypesAdmin() {
  const [types, setTypes] = useState([]);
  const [msg, setMsg] = useState('');

  const load = useCallback(async () => setTypes((await api('/admin/ticket-types')).ticketTypes), []);
  useEffect(() => { load(); }, [load]);

  async function save(t) {
    setMsg('');
    try {
      await api(`/admin/ticket-types/${t.id}`, { method: 'PUT', body: {
        name: t.name, description: t.description, price_cents: Number(t.price_cents),
        quantity_total: t.quantity_total === '' || t.quantity_total == null ? null : Number(t.quantity_total),
        is_active: t.is_active,
      } });
      setMsg(`Saved ${t.name}.`); await load();
    } catch (err) { setMsg(err.message); }
  }
  const set = (id, k, v) => setTypes((arr) => arr.map((t) => (t.id === id ? { ...t, [k]: v } : t)));

  return (
    <div>
      <h1 className="glow">Ticket Types</h1>
      {msg && <p className="muted">{msg}</p>}
      {types.map((t) => (
        <div className="card" key={t.id} style={{ marginBottom: 10 }}>
          <div className="grid cols-4" style={{ alignItems: 'end' }}>
            <div><label>Name</label><input value={t.name} onChange={(e) => set(t.id, 'name', e.target.value)} /></div>
            <div><label>Price (cents)</label><input type="number" value={t.price_cents} onChange={(e) => set(t.id, 'price_cents', e.target.value)} /></div>
            <div><label>Inventory cap (blank = ∞)</label><input type="number" value={t.quantity_total ?? ''} onChange={(e) => set(t.id, 'quantity_total', e.target.value)} /></div>
            <div><label style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}><input type="checkbox" style={{ width: 'auto' }} checked={t.is_active} onChange={(e) => set(t.id, 'is_active', e.target.checked)} /> Active</label></div>
          </div>
          <label>Description</label><input value={t.description || ''} onChange={(e) => set(t.id, 'description', e.target.value)} />
          <p className="muted" style={{ fontSize: 12 }}>Sold: {t.quantity_sold}</p>
          <button className="btn" onClick={() => save(t)}>Save</button>
        </div>
      ))}
    </div>
  );
}
