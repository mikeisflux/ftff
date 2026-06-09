import { useEffect, useState, useCallback } from 'react';
import { api } from '../../lib/api.js';

// Live chat moderation (§11): review recent messages, hide/unhide. Hiding
// removes a message from history and from every connected viewer immediately.
export default function Chat() {
  const [messages, setMessages] = useState([]);

  const load = useCallback(async () => setMessages((await api('/admin/chat')).messages), []);
  useEffect(() => { load(); const t = setInterval(load, 8000); return () => clearInterval(t); }, [load]);

  async function hide(id, hidden) {
    await api(`/admin/chat/${id}/hide`, { method: 'POST', body: { hidden } });
    await load();
  }

  return (
    <div>
      <h1 className="glow">Live Chat Moderation</h1>
      <p className="muted">Auto-refreshes. Hiding a message removes it for all viewers instantly.</p>
      <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr style={{ textAlign: 'left' }}><th style={{ padding: 10 }}>Time</th><th>Handle</th><th>Message</th><th>IP</th><th>Actions</th></tr></thead>
          <tbody>
            {messages.map((m) => (
              <tr key={m.id} style={{ borderTop: '1px solid rgba(255,255,255,.08)', opacity: m.is_hidden ? 0.5 : 1 }}>
                <td style={{ padding: 10, whiteSpace: 'nowrap' }} className="muted">{new Date(m.created_at).toLocaleTimeString()}</td>
                <td>{m.handle}{m.role === 'staff' ? ' ★' : ''}</td>
                <td style={{ textDecoration: m.is_hidden ? 'line-through' : 'none' }}>{m.body}</td>
                <td className="muted" style={{ fontSize: 12 }}>{m.ip}</td>
                <td style={{ padding: 10 }}>
                  <button className="btn secondary" onClick={() => hide(m.id, !m.is_hidden)}>
                    {m.is_hidden ? 'Unhide' : 'Hide'}
                  </button>
                </td>
              </tr>
            ))}
            {messages.length === 0 && <tr><td colSpan={5} className="muted" style={{ padding: 16 }}>No messages yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
