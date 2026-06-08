import { useEffect, useState } from 'react';
import { api } from '../../lib/api.js';

const money = (cents) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format((cents || 0) / 100);

export default function Dashboard() {
  const [d, setD] = useState(null);
  useEffect(() => { api('/admin/dashboard').then(setD).catch(() => {}); }, []);
  if (!d) return <div><h1 className="glow">Dashboard</h1><p className="muted">Loading…</p></div>;

  const cards = [
    ['Gross revenue', money(d.revenue.grossCents)],
    ['Paid orders', d.revenue.paidOrders],
    ['Ticket revenue', money(d.revenue.ticketCents)],
    ['Store revenue', money(d.revenue.storeCents)],
    ['Tickets issued', d.tickets.issued],
    ['Checked in', d.tickets.checked_in],
    ['Booths sold', d.booths.sold],
    ['Unread messages', d.submissions.unread],
  ];

  return (
    <div>
      <h1 className="glow">Dashboard</h1>
      <div className="grid cols-4">
        {cards.map(([label, value]) => (
          <div className="card" key={label}>
            <p className="muted">{label}</p>
            <h2 style={{ margin: 0 }}>{value}</h2>
          </div>
        ))}
      </div>
    </div>
  );
}
