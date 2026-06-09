import { useEffect, useState } from 'react';
import { api } from '../../lib/api.js';
import { money } from '../../lib/exhibitorPricing.js';

const STATUS_LABEL = {
  awaiting_payment: 'Awaiting payment',
  check_pending: 'Check pending',
  deposit_paid: 'Deposit paid',
  paid_in_full: 'Paid in full',
  cancelled: 'Cancelled',
};

export default function Exhibitors() {
  const [apps, setApps] = useState([]);
  const [pools, setPools] = useState([]);
  const [open, setOpen] = useState(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [tableTotal, setTableTotal] = useState('');

  async function load() {
    setError('');
    try {
      const [a, p] = await Promise.all([api('/admin/exhibitors'), api('/admin/exhibitors/inventory')]);
      setApps(a.applications);
      setPools(p.pools);
      const tables = p.pools.find((x) => x.key === 'extra_tables');
      if (tables) setTableTotal(String(tables.total));
    } catch (err) {
      setError(err.message);
    }
  }
  useEffect(() => { load(); }, []);

  async function act(id, action) {
    setBusy(id + action);
    setError('');
    try {
      await api(`/admin/exhibitors/${id}/${action}`, { method: 'POST', body: {} });
      await load();
      setOpen(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy('');
    }
  }

  async function saveTables(e) {
    e.preventDefault();
    setBusy('tables');
    setError('');
    try {
      await api('/admin/exhibitors/inventory/extra_tables', { method: 'PUT', body: { total: Number(tableTotal) || 0 } });
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy('');
    }
  }

  const tables = pools.find((p) => p.key === 'extra_tables');

  return (
    <div>
      <h1>Exhibitors</h1>
      {error && <p style={{ color: 'var(--color-danger)' }}>{error}</p>}

      <div className="card" style={{ marginBottom: 20 }}>
        <h3 style={{ marginTop: 0 }}>Additional table inventory</h3>
        {tables && (
          <p className="muted">
            Sold {tables.sold} · Reserved {tables.reserved} · Available <strong>{tables.available}</strong> of {tables.total}.
          </p>
        )}
        <form onSubmit={saveTables} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <label style={{ margin: 0 }}>Total tables for sale</label>
          <input style={{ width: 100 }} value={tableTotal} onChange={(e) => setTableTotal(e.target.value.replace(/[^0-9]/g, ''))} inputMode="numeric" />
          <button className="btn" disabled={busy === 'tables'}>{busy === 'tables' ? 'Saving…' : 'Save'}</button>
        </form>
        <p className="muted" style={{ fontSize: '.8rem', marginTop: 6 }}>
          The system never sells more tables than this. You can’t set it below what’s already sold + reserved.
        </p>
      </div>

      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ textAlign: 'left', borderBottom: '1px solid rgba(255,255,255,.12)' }}>
            <th>Vendor</th><th>Booth</th><th>Status</th><th>Total</th><th>Paid</th><th>Balance</th><th></th>
          </tr>
        </thead>
        <tbody>
          {apps.map((a) => (
            <tr key={a.id} style={{ borderBottom: '1px solid rgba(255,255,255,.06)' }}>
              <td>{a.vendor_name}<br /><span className="muted" style={{ fontSize: '.8rem' }}>{a.reference}</span></td>
              <td>{a.booth_label || '—'}</td>
              <td>{STATUS_LABEL[a.status] || a.status}</td>
              <td>{money(a.total_cents)}</td>
              <td>{money(a.amount_paid_cents)}</td>
              <td>{a.balance_cents > 0 ? money(a.balance_cents) : '—'}</td>
              <td><button className="btn secondary" onClick={() => setOpen(open === a.id ? null : a.id)}>{open === a.id ? 'Close' : 'Manage'}</button></td>
            </tr>
          ))}
          {apps.length === 0 && <tr><td colSpan={7} className="muted" style={{ padding: 16 }}>No exhibitor applications yet.</td></tr>}
        </tbody>
      </table>

      {open && (() => {
        const a = apps.find((x) => x.id === open);
        if (!a) return null;
        return (
          <div className="card" style={{ marginTop: 16 }}>
            <h3 style={{ marginTop: 0 }}>{a.vendor_name} — {a.reference}</h3>
            <p className="muted">{a.contact_name} · {a.contact_email} · {a.contact_phone}</p>
            <p>{a.company_name} — {a.address}</p>
            <p>Category: {a.category || '—'} · Website: {a.website || '—'}</p>
            <ul>
              {(Array.isArray(a.breakdown) ? a.breakdown : []).map((l) => (
                <li key={l.key}>{l.qty} × {l.label} — {money(l.amountCents)}</li>
              ))}
            </ul>
            <p>
              Hotel: {[a.hotel_night1 && 'N1', a.hotel_night2 && 'N2', a.hotel_night3 && 'N3'].filter(Boolean).join(', ') || 'none'} ·
              Extra tables: {a.extra_tables} ·
              Banquet: {a.banquet ? `${a.banquet_chicken}🍗 ${a.banquet_beef}🥩 ${a.banquet_vegan}🌱` : 'no'}
            </p>
            {a.dietary && <p>Dietary: {a.dietary}</p>}
            {a.additional_request && <p>Requests: {a.additional_request}</p>}
            {a.livestreaming && <p>Live streaming{a.livestream_panel ? ` · Panel: ${a.panel_name || '?'} (${a.panel_day || '?'})` : ''}</p>}
            <p className="muted">Method: {a.payment_method || '—'} · Choice: {a.payment_choice || '—'} · Signed: {a.signature}</p>

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
              {(a.status === 'check_pending' || (a.status === 'deposit_paid' && a.payment_method === 'check' && a.balance_cents > 0)) && (
                <button className="btn" disabled={busy === a.id + 'mark-paid'} onClick={() => act(a.id, 'mark-paid')}>
                  {busy === a.id + 'mark-paid' ? 'Working…' : 'Mark check received'}
                </button>
              )}
              {a.status === 'deposit_paid' && a.balance_cents > 0 && (
                <button className="btn" disabled={busy === a.id + 'send-balance'} onClick={() => act(a.id, 'send-balance')}>
                  {busy === a.id + 'send-balance' ? 'Sending…' : a.balance_request_sent_at ? 'Resend balance invoice' : 'Send balance invoice'}
                </button>
              )}
              {a.status !== 'paid_in_full' && a.status !== 'cancelled' && (
                <button className="btn secondary" disabled={busy === a.id + 'cancel'} onClick={() => act(a.id, 'cancel')}>
                  {busy === a.id + 'cancel' ? 'Working…' : 'Cancel'}
                </button>
              )}
            </div>
            {a.balance_request_sent_at && <p className="muted" style={{ fontSize: '.8rem', marginTop: 8 }}>Balance invoice sent {new Date(a.balance_request_sent_at).toLocaleString()}.</p>}
          </div>
        );
      })()}
    </div>
  );
}
