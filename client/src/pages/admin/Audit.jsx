import { useEffect, useState, useCallback } from 'react';
import { api } from '../../lib/api.js';

// Audit log viewer (§4.3, §13).
export default function Audit() {
  const [entries, setEntries] = useState([]);
  const [action, setAction] = useState('');

  const load = useCallback(async () => {
    const qs = action ? `?action=${encodeURIComponent(action)}` : '';
    setEntries((await api(`/admin/audit${qs}`)).entries);
  }, [action]);
  useEffect(() => { load(); }, [load]);

  return (
    <div>
      <h1 className="glow">Audit Log</h1>
      <form onSubmit={(e) => { e.preventDefault(); load(); }} style={{ marginBottom: 12 }}>
        <input value={action} onChange={(e) => setAction(e.target.value)} placeholder="Filter by action (e.g. settings, order, user)" style={{ maxWidth: 360 }} />
      </form>
      <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr style={{ textAlign: 'left' }}><th style={{ padding: 10 }}>When</th><th>Actor</th><th>Action</th><th>Entity</th><th>Details</th></tr></thead>
          <tbody>
            {entries.map((e) => (
              <tr key={e.id} style={{ borderTop: '1px solid rgba(255,255,255,.08)' }}>
                <td style={{ padding: 10, whiteSpace: 'nowrap' }} className="muted">{new Date(e.created_at).toLocaleString()}</td>
                <td>{e.actor_email || 'system'}</td>
                <td><code>{e.action}</code></td>
                <td className="muted">{e.entity}{e.entity_id ? `:${String(e.entity_id).slice(0, 8)}` : ''}</td>
                <td className="muted" style={{ fontSize: 12 }}>{e.meta ? JSON.stringify(e.meta) : ''}</td>
              </tr>
            ))}
            {entries.length === 0 && <tr><td colSpan={5} className="muted" style={{ padding: 16 }}>No audit entries.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
