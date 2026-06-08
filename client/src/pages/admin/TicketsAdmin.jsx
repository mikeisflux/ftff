import { useEffect, useState, useCallback } from 'react';
import { api } from '../../lib/api.js';

// Admin ticket dashboard (§8): live counts, search, manual check-in, void,
// resend.
export default function TicketsAdmin() {
  const [stats, setStats] = useState(null);
  const [q, setQ] = useState('');
  const [tickets, setTickets] = useState([]);
  const [msg, setMsg] = useState('');

  const loadStats = useCallback(() => {
    api('/admin/tickets/stats').then(setStats).catch(() => {});
  }, []);

  const search = useCallback(async (term) => {
    const qs = term ? `?q=${encodeURIComponent(term)}` : '';
    const { tickets } = await api(`/admin/tickets${qs}`);
    setTickets(tickets);
  }, []);

  useEffect(() => { loadStats(); search(''); }, [loadStats, search]);

  async function act(id, action) {
    setMsg('');
    try {
      const r = await api(`/admin/tickets/${id}/${action}`, { method: 'POST' });
      if (action === 'resend') setMsg(r.email?.skipped ? 'Email skipped (SendGrid not configured).' : 'Email sent.');
      await search(q);
      loadStats();
    } catch (err) {
      setMsg(err.message);
    }
  }

  return (
    <div>
      <h1 className="glow">Tickets</h1>

      {stats && (
        <div className="grid cols-4" style={{ marginBottom: 20 }}>
          <div className="card"><p className="muted">Issued</p><h2>{stats.totals.issued}</h2></div>
          <div className="card"><p className="muted">Checked in</p><h2>{stats.totals.checked_in}</h2></div>
          <div className="card"><p className="muted">Void</p><h2>{stats.totals.void}</h2></div>
          <div className="card">
            <p className="muted">By type</p>
            {stats.byType.map((t) => (
              <div key={t.code} style={{ fontSize: '.85rem' }}>{t.name}: {t.checked_in}/{t.issued}</div>
            ))}
          </div>
        </div>
      )}

      <form onSubmit={(e) => { e.preventDefault(); search(q); }} style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search order #, email, name, or token" />
        <button className="btn">Search</button>
      </form>
      {msg && <p className="muted">{msg}</p>}

      <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ textAlign: 'left' }}>
              <th style={{ padding: 10 }}>Type</th><th>Attendee</th><th>Order</th><th>Status</th><th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {tickets.map((t) => (
              <tr key={t.id} style={{ borderTop: '1px solid rgba(255,255,255,.08)' }}>
                <td style={{ padding: 10 }}>{t.ticket_name}</td>
                <td>{t.attendee_name || t.customer_name}<br /><span className="muted" style={{ fontSize: '.8rem' }}>{t.customer_email}</span></td>
                <td>{t.order_number}</td>
                <td>
                  <span style={{ color: t.status === 'checked_in' ? 'var(--color-muted)' : t.status === 'void' ? 'var(--color-danger)' : 'var(--color-success)' }}>
                    {t.status}
                  </span>
                </td>
                <td style={{ display: 'flex', gap: 6, padding: 10, flexWrap: 'wrap' }}>
                  {t.status === 'valid' && <button className="btn secondary" onClick={() => act(t.id, 'checkin')}>Check in</button>}
                  {t.status !== 'void' && <button className="btn secondary" onClick={() => act(t.id, 'void')}>Void</button>}
                  <button className="btn secondary" onClick={() => act(t.id, 'resend')}>Resend</button>
                </td>
              </tr>
            ))}
            {tickets.length === 0 && (
              <tr><td colSpan={5} style={{ padding: 16 }} className="muted">No tickets found.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
