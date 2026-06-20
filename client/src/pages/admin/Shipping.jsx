import { useEffect, useState, useCallback } from 'react';
import { api } from '../../lib/api.js';
import { SHIPPING_REGION_META } from '../../lib/shipping.js';

const toDollars = (c) => (Number(c || 0) / 100).toFixed(2);
const toCents = (d) => Math.round(Number(d || 0) * 100);

// Flat per-order shipping rates by destination region. One fee per order,
// charged only when the buyer chooses to ship a physical item.
export default function Shipping() {
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  const load = useCallback(async () => {
    try {
      const { rates } = await api('/admin/shipping');
      setForm(Object.fromEntries(SHIPPING_REGION_META.map((r) => [r.key, toDollars(rates[r.key])])));
    } catch (e) { setMsg(e.message); }
  }, []);
  useEffect(() => { load(); }, [load]);

  async function save(e) {
    e.preventDefault();
    setBusy(true); setMsg('');
    try {
      const body = Object.fromEntries(SHIPPING_REGION_META.map((r) => [r.key, toCents(form[r.key])]));
      const { rates } = await api('/admin/shipping', { method: 'PUT', body });
      setForm(Object.fromEntries(SHIPPING_REGION_META.map((r) => [r.key, toDollars(rates[r.key])])));
      setMsg('Saved ✓');
    } catch (e) { setMsg(e.data?.details?.[0]?.message || e.message); }
    finally { setBusy(false); }
  }

  if (!form) return <div><h1 className="glow">Shipping</h1><p className="muted">Loading…</p></div>;

  return (
    <div>
      <h1 className="glow">Shipping</h1>
      <p className="muted" style={{ maxWidth: 640 }}>
        Flat per-order shipping fee by destination. One fee is charged per order (not per item) when a buyer chooses to
        ship physical goods. Pickup at the show is always free, and digital products never ship.
      </p>
      <form className="card" onSubmit={save} style={{ maxWidth: 480 }}>
        {SHIPPING_REGION_META.map((r) => (
          <div key={r.key} style={{ marginBottom: 12 }}>
            <label>{r.label}</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span className="muted">$</span>
              <input
                type="number" step="0.01" min="0" style={{ maxWidth: 160 }}
                value={form[r.key]}
                onChange={(e) => setForm((f) => ({ ...f, [r.key]: e.target.value }))}
              />
            </div>
          </div>
        ))}
        {msg && <p className="muted">{msg}</p>}
        <button className="btn" disabled={busy}>{busy ? 'Saving…' : 'Save rates'}</button>
      </form>
    </div>
  );
}
