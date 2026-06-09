import { useEffect, useState, useCallback } from 'react';
import { api } from '../../lib/api.js';

// Submissions inbox (contact/media/exhibitor) + newsletter list/export (§13).
export default function Submissions() {
  const [tab, setTab] = useState('contact'); // contact | media | exhibitor | newsletter
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(null);

  const isApplications = tab === 'applications';
  const base = isApplications ? '/admin/applications' : '/admin/submissions';

  const load = useCallback(async () => {
    setOpen(null);
    if (tab === 'newsletter') {
      setItems((await api('/admin/newsletter')).subscribers);
    } else if (tab === 'applications') {
      setItems((await api('/admin/applications')).applications);
    } else {
      setItems((await api(`/admin/submissions?kind=${tab}`)).submissions);
    }
  }, [tab]);
  useEffect(() => { load(); }, [load]);

  async function markRead(id, read) { await api(`${base}/${id}/read`, { method: 'POST', body: { read } }); await load(); }
  async function del(id) { if (window.confirm('Delete this submission?')) { await api(`${base}/${id}`, { method: 'DELETE' }); await load(); } }

  const TABS = [['contact', 'Contact'], ['media', 'Media'], ['exhibitor', 'Exhibitor'], ['applications', 'Applications'], ['newsletter', 'Newsletter']];

  return (
    <div>
      <h1 className="glow">Submissions</h1>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        {TABS.map(([k, label]) => (
          <button key={k} className={tab === k ? 'btn' : 'btn secondary'} onClick={() => setTab(k)}>{label}</button>
        ))}
        {tab === 'newsletter' && (
          <a className="btn secondary" href="/api/v1/admin/newsletter/export.csv">Export CSV</a>
        )}
      </div>

      {tab === 'newsletter' ? (
        <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr style={{ textAlign: 'left' }}><th style={{ padding: 10 }}>Email</th><th>Status</th><th>Joined</th></tr></thead>
            <tbody>
              {items.map((s) => (
                <tr key={s.email} style={{ borderTop: '1px solid rgba(255,255,255,.08)' }}>
                  <td style={{ padding: 10 }}>{s.email}</td><td>{s.status}</td><td className="muted">{new Date(s.created_at).toLocaleDateString()}</td>
                </tr>
              ))}
              {items.length === 0 && <tr><td colSpan={3} className="muted" style={{ padding: 16 }}>No subscribers.</td></tr>}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div className="card" style={{ padding: 0 }}>
            {items.map((s) => (
              <button key={s.id} onClick={() => { setOpen(s); if (!s.is_read) markRead(s.id, true); }}
                style={{ display: 'block', width: '100%', textAlign: 'left', border: 'none', cursor: 'pointer', padding: 10, background: open?.id === s.id ? 'color-mix(in srgb, var(--color-primary) 18%, transparent)' : 'none', color: 'var(--color-text)', borderBottom: '1px solid rgba(255,255,255,.06)', fontWeight: s.is_read ? 400 : 700 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>{s.name}</span><span className="muted" style={{ fontSize: 11 }}>{new Date(s.created_at).toLocaleDateString()}</span></div>
                <div className="muted" style={{ fontSize: 12 }}>{s.subject || s.email}</div>
              </button>
            ))}
            {items.length === 0 && <p className="muted" style={{ padding: 16 }}>No submissions.</p>}
          </div>
          <div className="card">
            {!open ? <p className="muted">Select a submission.</p> : (
              <>
                <h3 style={{ marginTop: 0 }}>{open.subject || `${open.kind} message`}</h3>
                <p className="muted">{open.name} &lt;{open.email}&gt;{open.company ? ` · ${open.company}` : ''}</p>
                <p style={{ whiteSpace: 'pre-wrap' }}>{open.message}</p>
                <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                  <a className="btn secondary" href={`mailto:${open.email}`}>Reply</a>
                  <button className="btn secondary" onClick={() => markRead(open.id, false)}>Mark unread</button>
                  <button className="btn secondary" onClick={() => del(open.id)}>Delete</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
