import { useEffect, useState } from 'react';
import { api } from '../../lib/api.js';
import { money } from '../../lib/exhibitorPricing.js';

export default function Rewards() {
  const [rewards, setRewards] = useState([]);
  const [open, setOpen] = useState(null); // reward id
  const [detail, setDetail] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');

  async function load() {
    setError('');
    try { setRewards((await api('/admin/rewards')).rewards); }
    catch (err) { setError(err.message); }
  }
  useEffect(() => { load(); }, []);

  async function openDetail(id) {
    if (open === id) { setOpen(null); setDetail(null); return; }
    setOpen(id);
    setDetail(null);
    try { setDetail(await api(`/admin/rewards/${id}`)); }
    catch (err) { setError(err.message); }
  }

  async function action(id, kind) {
    const cents = Math.round(Number(amount) * 100);
    if (!cents) { setError('Enter an amount.'); return; }
    setBusy(kind); setError('');
    try {
      await api(`/admin/rewards/${id}/${kind}`, { method: 'POST', body: { amountCents: cents, note: note || undefined } });
      setAmount(''); setNote('');
      await load();
      setDetail(await api(`/admin/rewards/${id}`));
    } catch (err) {
      setError(err.data?.code === 'insufficient' ? 'Amount exceeds the available balance.'
        : err.data?.code === 'negative' ? 'That would make the balance negative.'
        : err.message);
    } finally { setBusy(''); }
  }

  async function toggle(id) {
    await api(`/admin/rewards/${id}/toggle`, { method: 'POST', body: {} }).catch((e) => setError(e.message));
    await load();
  }

  return (
    <div>
      <h1>Exhibitor Rewards</h1>
      <p className="muted">Referral cash-back balances. Exhibitors earn 5% of ticket sales made through their share link.</p>
      {error && <p style={{ color: 'var(--color-danger)' }}>{error}</p>}

      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ textAlign: 'left', borderBottom: '1px solid rgba(255,255,255,.12)' }}>
            <th>Exhibitor</th><th>Code</th><th>Referrals</th><th>Earned</th><th>Balance</th><th>Status</th><th></th>
          </tr>
        </thead>
        <tbody>
          {rewards.map((r) => (
            <tr key={r.id} style={{ borderBottom: '1px solid rgba(255,255,255,.06)' }}>
              <td>{r.name || '—'}<br /><span className="muted" style={{ fontSize: '.8rem' }}>{r.email}</span></td>
              <td><code>{r.code}</code></td>
              <td>{r.referral_count}</td>
              <td>{money(r.earned_cents)}</td>
              <td><strong>{money(r.balance_cents)}</strong></td>
              <td>{r.is_active ? 'Active' : 'Paused'}</td>
              <td><button className="btn secondary" onClick={() => openDetail(r.id)}>{open === r.id ? 'Close' : 'Manage'}</button></td>
            </tr>
          ))}
          {rewards.length === 0 && <tr><td colSpan={7} className="muted" style={{ padding: 16 }}>No rewards accounts yet.</td></tr>}
        </tbody>
      </table>

      {open && detail && (
        <div className="card" style={{ marginTop: 16 }}>
          <h3 style={{ marginTop: 0 }}>{detail.reward.name || detail.reward.email} — balance {money(detail.reward.balance_cents)}</h3>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', margin: '8px 0 16px' }}>
            <input placeholder="Amount ($)" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ''))} style={{ width: 120 }} inputMode="decimal" />
            <input placeholder="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} style={{ width: 220 }} />
            <button className="btn" disabled={busy === 'redeem'} onClick={() => action(detail.reward.id, 'redeem')}>Redeem to booking</button>
            <button className="btn secondary" disabled={busy === 'adjust'} onClick={() => action(detail.reward.id, 'adjust')}>Adjust (+/−)</button>
            <button className="btn secondary" onClick={() => toggle(detail.reward.id)}>{detail.reward.is_active ? 'Pause' : 'Resume'}</button>
          </div>
          <p className="muted" style={{ fontSize: '.8rem' }}>Redeem deducts from the balance toward a booth booking. Adjust accepts a positive or negative dollar amount.</p>

          <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 8 }}>
            <thead><tr style={{ textAlign: 'left' }}><th>Date</th><th>Type</th><th>Order</th><th>Note</th><th style={{ textAlign: 'right' }}>Amount</th></tr></thead>
            <tbody>
              {detail.events.map((e) => (
                <tr key={e.id} style={{ borderBottom: '1px solid rgba(255,255,255,.06)' }}>
                  <td>{new Date(e.created_at).toLocaleDateString()}</td>
                  <td style={{ textTransform: 'capitalize' }}>{e.type}</td>
                  <td className="muted">{e.order_number || '—'}</td>
                  <td className="muted">{e.note}</td>
                  <td style={{ textAlign: 'right', color: e.amount_cents >= 0 ? 'var(--color-success)' : 'var(--color-danger)' }}>
                    {e.amount_cents >= 0 ? '+' : '−'}{money(Math.abs(e.amount_cents))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
