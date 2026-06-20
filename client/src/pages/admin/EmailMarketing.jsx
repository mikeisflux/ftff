import { useEffect, useState, useCallback } from 'react';
import { api } from '../../lib/api.js';

// Email marketing: manage newsletter subscribers + compose/send campaigns.
export default function EmailMarketing() {
  const [data, setData] = useState({ subscribers: [], campaigns: [], counts: {}, total: 0 });
  const [tab, setTab] = useState('subscribers');
  const [filter, setFilter] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newName, setNewName] = useState('');
  const [campaign, setCampaign] = useState({ subject: '', body_html: '', audience: 'subscribed' });
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => setData(await api('/admin/email-marketing')), []);
  useEffect(() => { load(); }, [load]);

  async function addSub(e) {
    e.preventDefault(); setMsg('');
    try { await api('/admin/email-marketing/subscribers', { method: 'POST', body: { email: newEmail, name: newName || null } }); setNewEmail(''); setNewName(''); await load(); }
    catch (err) { setMsg(err.message); }
  }
  async function setStatus(id, status) { await api(`/admin/email-marketing/subscribers/${id}`, { method: 'PUT', body: { status } }); await load(); }
  async function del(id) { if (window.confirm('Delete subscriber?')) { await api(`/admin/email-marketing/subscribers/${id}`, { method: 'DELETE' }); await load(); } }

  async function send(e) {
    e.preventDefault(); setMsg('');
    if (!campaign.subject.trim() || !campaign.body_html.trim()) return setMsg('Subject and body are required.');
    if (!window.confirm(`Send "${campaign.subject}" to the ${campaign.audience} list?`)) return;
    setBusy(true);
    try {
      const r = await api('/admin/email-marketing/campaigns', { method: 'POST', body: campaign });
      setMsg(`Sent to ${r.sent} of ${r.recipients} recipients.`);
      setCampaign({ subject: '', body_html: '', audience: 'subscribed' });
      await load();
    } catch (err) { setMsg(err.data?.code === 'no_recipients' ? 'No recipients in that audience.' : err.message); }
    finally { setBusy(false); }
  }

  const subs = filter ? data.subscribers.filter((s) => s.email.toLowerCase().includes(filter.toLowerCase())) : data.subscribers;

  return (
    <div>
      <h1 className="glow">Email Marketing</h1>
      <p className="muted">
        {data.total} subscribers · {data.counts.subscribed || 0} subscribed · {data.counts.unsubscribed || 0} unsubscribed.
        Anyone who submits a form or makes a purchase with an email is added automatically.
      </p>
      {msg && <p style={{ color: 'var(--color-success)' }}>{msg}</p>}

      <div style={{ display: 'flex', gap: 8, margin: '12px 0' }}>
        <button className={`btn ${tab === 'subscribers' ? '' : 'secondary'}`} onClick={() => setTab('subscribers')}>Subscribers</button>
        <button className={`btn ${tab === 'compose' ? '' : 'secondary'}`} onClick={() => setTab('compose')}>Compose campaign</button>
        <button className={`btn ${tab === 'campaigns' ? '' : 'secondary'}`} onClick={() => setTab('campaigns')}>Sent campaigns</button>
      </div>

      {tab === 'subscribers' && (
        <>
          <form onSubmit={addSub} className="card" style={{ display: 'flex', gap: 8, alignItems: 'end', flexWrap: 'wrap', marginBottom: 12 }}>
            <div><label>Email</label><input type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} required /></div>
            <div><label>Name (optional)</label><input value={newName} onChange={(e) => setNewName(e.target.value)} /></div>
            <button className="btn">Add subscriber</button>
            <a className="btn secondary" href="/api/v1/admin/email-marketing/export.csv">Export CSV</a>
          </form>
          <input placeholder="Filter by email…" value={filter} onChange={(e) => setFilter(e.target.value)} style={{ width: 280, marginBottom: 8 }} />
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr style={{ textAlign: 'left' }}><th>Email</th><th>Name</th><th>Source</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {subs.map((s) => (
                <tr key={s.id} style={{ borderTop: '1px solid rgba(255,255,255,.08)' }}>
                  <td>{s.email}</td>
                  <td className="muted">{s.name || '—'}</td>
                  <td className="muted">{s.source || '—'}</td>
                  <td>{s.status}</td>
                  <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    {s.status !== 'subscribed' && <button className="btn secondary" onClick={() => setStatus(s.id, 'subscribed')}>Subscribe</button>}{' '}
                    {s.status !== 'unsubscribed' && <button className="btn secondary" onClick={() => setStatus(s.id, 'unsubscribed')}>Unsubscribe</button>}{' '}
                    <button className="btn secondary" onClick={() => del(s.id)}>✕</button>
                  </td>
                </tr>
              ))}
              {subs.length === 0 && <tr><td colSpan={5} className="muted" style={{ padding: 16 }}>No subscribers yet.</td></tr>}
            </tbody>
          </table>
        </>
      )}

      {tab === 'compose' && (
        <form onSubmit={send} className="card" style={{ maxWidth: 760 }}>
          <h3 style={{ marginTop: 0 }}>Compose campaign</h3>
          <label>Audience</label>
          <select value={campaign.audience} onChange={(e) => setCampaign((c) => ({ ...c, audience: e.target.value }))}>
            <option value="subscribed">Subscribed only ({data.counts.subscribed || 0})</option>
            <option value="all">Everyone except unsubscribed</option>
          </select>
          <label>Subject</label>
          <input value={campaign.subject} onChange={(e) => setCampaign((c) => ({ ...c, subject: e.target.value }))} required />
          <label>Body (HTML allowed)</label>
          <textarea rows={12} value={campaign.body_html} onChange={(e) => setCampaign((c) => ({ ...c, body_html: e.target.value }))} placeholder="<h1>Hello fans!</h1><p>…</p>" required />
          <p className="muted" style={{ fontSize: '.8rem' }}>An unsubscribe link is appended automatically (required by law).</p>
          <button className="btn" disabled={busy}>{busy ? 'Sending…' : 'Send campaign'}</button>
        </form>
      )}

      {tab === 'campaigns' && (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr style={{ textAlign: 'left' }}><th>Subject</th><th>Audience</th><th>Sent</th><th>When</th></tr></thead>
          <tbody>
            {data.campaigns.map((c) => (
              <tr key={c.id} style={{ borderTop: '1px solid rgba(255,255,255,.08)' }}>
                <td>{c.subject}</td>
                <td className="muted">{c.audience}</td>
                <td>{c.sent_count}/{c.recipient_count}</td>
                <td className="muted">{c.sent_at ? new Date(c.sent_at).toLocaleString() : '—'}</td>
              </tr>
            ))}
            {data.campaigns.length === 0 && <tr><td colSpan={4} className="muted" style={{ padding: 16 }}>No campaigns sent yet.</td></tr>}
          </tbody>
        </table>
      )}
    </div>
  );
}
