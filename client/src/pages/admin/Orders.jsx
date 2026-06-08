import { useEffect, useState, useCallback } from 'react';
import { api } from '../../lib/api.js';

const money = (cents, cur = 'USD') => new Intl.NumberFormat('en-US', { style: 'currency', currency: cur.toUpperCase() }).format((cents || 0) / 100);

// Admin order management (§10, §15): list, mark fulfillment, refund.
export default function Orders() {
  const [orders, setOrders] = useState([]);
  const [kind, setKind] = useState('');
  const [msg, setMsg] = useState('');

  const load = useCallback(async () => {
    const qs = kind ? `?kind=${kind}` : '';
    const { orders } = await api(`/admin/orders${qs}`);
    setOrders(orders);
  }, [kind]);
  useEffect(() => { load(); }, [load]);

  async function refund(id) {
    setMsg('');
    if (!window.confirm('Refund this order in full via Stripe?')) return;
    try { await api(`/admin/orders/${id}/refund`, { method: 'POST' }); await load(); }
    catch (err) { setMsg(err.message); }
  }
  async function fulfill(id, status) {
    await api(`/admin/orders/${id}/fulfillment`, { method: 'POST', body: { status } }).catch((e) => setMsg(e.message));
    await load();
  }

  return (
    <div>
      <h1 className="glow">Orders</h1>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <select value={kind} onChange={(e) => setKind(e.target.value)} style={{ width: 200 }}>
          <option value="">All kinds</option>
          <option value="ticket">Tickets</option>
          <option value="vendor">Vendor</option>
          <option value="store">Store</option>
        </select>
      </div>
      {msg && <p style={{ color: 'var(--color-danger)' }}>{msg}</p>}
      <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr style={{ textAlign: 'left' }}><th style={{ padding: 10 }}>Order</th><th>Customer</th><th>Kind</th><th>Total</th><th>Status</th><th>Fulfillment</th><th>Actions</th></tr></thead>
          <tbody>
            {orders.map((o) => (
              <tr key={o.id} style={{ borderTop: '1px solid rgba(255,255,255,.08)' }}>
                <td style={{ padding: 10 }}>{o.order_number}</td>
                <td>{o.customer_name}<br /><span className="muted" style={{ fontSize: '.8rem' }}>{o.customer_email}</span></td>
                <td>{o.kind}</td>
                <td>{money(o.total_cents, o.currency)}</td>
                <td style={{ color: o.status === 'paid' ? 'var(--color-success)' : o.status === 'refunded' ? 'var(--color-danger)' : 'var(--color-muted)' }}>{o.status}</td>
                <td>
                  {o.kind === 'store' ? (
                    <select value={o.fulfillment_status} onChange={(e) => fulfill(o.id, e.target.value)}>
                      {['unfulfilled', 'fulfilled', 'shipped', 'cancelled'].map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                  ) : <span className="muted">—</span>}
                </td>
                <td style={{ padding: 10 }}>
                  {o.status === 'paid' && <button className="btn secondary" onClick={() => refund(o.id)}>Refund</button>}
                </td>
              </tr>
            ))}
            {orders.length === 0 && <tr><td colSpan={7} style={{ padding: 16 }} className="muted">No orders.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
