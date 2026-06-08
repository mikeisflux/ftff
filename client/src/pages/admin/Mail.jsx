import { useEffect, useState, useCallback } from 'react';
import { api } from '../../lib/api.js';

const FOLDER_LABELS = { inbox: 'Inbox', sent: 'Sent', drafts: 'Drafts', archive: 'Archive', spam: 'Spam', trash: 'Trash' };

// Gmail-style admin email client (§12): folder rail + message list + reading
// pane, with compose/reply/forward, star, move, and delete.
export default function Mail() {
  const [folders, setFolders] = useState([]);
  const [folder, setFolder] = useState('inbox');
  const [q, setQ] = useState('');
  const [messages, setMessages] = useState([]);
  const [open, setOpen] = useState(null); // { message, thread }
  const [compose, setCompose] = useState(null); // { to, subject, text, threadId }
  const [msg, setMsg] = useState('');

  const loadFolders = useCallback(() => api('/admin/email/folders').then((d) => setFolders(d.folders)).catch(() => {}), []);
  const loadList = useCallback(async () => {
    const qs = `?folder=${folder}${q ? `&q=${encodeURIComponent(q)}` : ''}`;
    const { messages } = await api(`/admin/email/messages${qs}`);
    setMessages(messages);
  }, [folder, q]);

  useEffect(() => { loadFolders(); }, [loadFolders]);
  useEffect(() => { loadList(); setOpen(null); }, [loadList]);

  async function openMessage(id) {
    const data = await api(`/admin/email/messages/${id}`);
    setOpen(data);
    loadFolders(); loadList();
  }
  async function act(path, body, method = 'POST') {
    setMsg('');
    try { await api(`/admin/email${path}`, { method, body }); await loadList(); loadFolders(); }
    catch (err) { setMsg(err.message); }
  }
  async function sendCompose(e) {
    e.preventDefault();
    setMsg('');
    try {
      const r = await api('/admin/email/send', { method: 'POST', body: { to: compose.to, subject: compose.subject, text: compose.text, threadId: compose.threadId } });
      setCompose(null);
      setMsg(r.delivery?.skipped ? 'Saved to Sent (SendGrid not configured, not delivered).' : 'Sent.');
      loadFolders(); loadList();
    } catch (err) { setMsg(err.data?.details?.[0]?.message || err.message); }
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1 className="glow">Mail</h1>
        <button className="btn" onClick={() => setCompose({ to: '', subject: '', text: '', threadId: undefined })}>Compose</button>
      </div>
      {msg && <p className="muted">{msg}</p>}

      <div className="mail-grid">
        {/* Folder rail */}
        <div className="card" style={{ padding: 8 }}>
          {folders.map((f) => (
            <button key={f.folder} onClick={() => setFolder(f.folder)}
              className={folder === f.folder ? 'admin-link active' : 'admin-link'}
              style={{ width: '100%', textAlign: 'left', border: 'none', background: 'none', cursor: 'pointer', display: 'flex', justifyContent: 'space-between' }}>
              <span>{FOLDER_LABELS[f.folder]}</span>
              {f.unread > 0 && <span style={{ background: 'var(--color-accent)', borderRadius: 10, padding: '0 8px', fontSize: 12 }}>{f.unread}</span>}
            </button>
          ))}
        </div>

        {/* Message list */}
        <div className="card" style={{ padding: 0 }}>
          <form onSubmit={(e) => { e.preventDefault(); loadList(); }} style={{ padding: 8, borderBottom: '1px solid rgba(255,255,255,.08)' }}>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search mail" />
          </form>
          <div style={{ maxHeight: 520, overflowY: 'auto' }}>
            {messages.map((m) => (
              <button key={m.id} onClick={() => openMessage(m.id)}
                style={{ display: 'block', width: '100%', textAlign: 'left', border: 'none', cursor: 'pointer',
                  background: open?.message?.id === m.id ? 'color-mix(in srgb, var(--color-primary) 18%, transparent)' : 'none',
                  padding: 10, borderBottom: '1px solid rgba(255,255,255,.06)', color: 'var(--color-text)',
                  fontWeight: m.is_read ? 400 : 700 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>{m.is_starred ? '★ ' : ''}{m.direction === 'outbound' ? (JSON.parse(m.to_emails || '[]')[0] || '—') : (m.from_name || m.from_email || '—')}</span>
                  <span className="muted" style={{ fontSize: 11 }}>{new Date(m.created_at).toLocaleDateString()}</span>
                </div>
                <div>{m.subject}</div>
                <div className="muted" style={{ fontSize: 12, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.snippet}</div>
              </button>
            ))}
            {messages.length === 0 && <p className="muted" style={{ padding: 16 }}>No messages.</p>}
          </div>
        </div>

        {/* Reading pane */}
        <div className="card">
          {!open ? <p className="muted">Select a message to read.</p> : (
            <>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
                <button className="btn secondary" onClick={() => setCompose({ to: open.message.from_email || '', subject: `Re: ${open.message.subject}`, text: `\n\n--- On ${new Date(open.message.created_at).toLocaleString()} ${open.message.from_email} wrote ---\n${open.message.body_text || ''}`, threadId: open.message.thread_id || open.message.id })}>Reply</button>
                <button className="btn secondary" onClick={() => setCompose({ to: '', subject: `Fwd: ${open.message.subject}`, text: open.message.body_text || '', threadId: undefined })}>Forward</button>
                <button className="btn secondary" onClick={() => act(`/messages/${open.message.id}/star`, { starred: !open.message.is_starred })}>{open.message.is_starred ? 'Unstar' : 'Star'}</button>
                <button className="btn secondary" onClick={() => act(`/messages/${open.message.id}/move`, { folder: 'archive' })}>Archive</button>
                <button className="btn secondary" onClick={() => act(`/messages/${open.message.id}/move`, { folder: 'spam' })}>Spam</button>
                <button className="btn secondary" onClick={() => { act(`/messages/${open.message.id}`, undefined, 'DELETE'); setOpen(null); }}>Delete</button>
              </div>
              <h2 style={{ marginTop: 0 }}>{open.message.subject}</h2>
              <p className="muted">{open.message.from_name} &lt;{open.message.from_email}&gt; · {new Date(open.message.created_at).toLocaleString()}</p>
              {open.thread.map((t) => (
                <div key={t.id} style={{ borderTop: '1px solid rgba(255,255,255,.08)', paddingTop: 10, marginTop: 10 }}>
                  <p className="muted" style={{ fontSize: 12 }}>{t.direction === 'outbound' ? 'You' : (t.from_email)} · {new Date(t.created_at).toLocaleString()}</p>
                  {t.body_html ? <div dangerouslySetInnerHTML={{ __html: t.body_html }} /> : <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit' }}>{t.body_text}</pre>}
                </div>
              ))}
            </>
          )}
        </div>
      </div>

      {compose && (
        <div className="modal-backdrop" onClick={() => setCompose(null)}>
          <form className="card modal" onClick={(e) => e.stopPropagation()} onSubmit={sendCompose}>
            <h3>Compose</h3>
            <label>To</label>
            <input type="email" value={compose.to} onChange={(e) => setCompose((c) => ({ ...c, to: e.target.value }))} required />
            <label>Subject</label>
            <input value={compose.subject} onChange={(e) => setCompose((c) => ({ ...c, subject: e.target.value }))} />
            <label>Message</label>
            <textarea rows={10} value={compose.text} onChange={(e) => setCompose((c) => ({ ...c, text: e.target.value }))} required />
            <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
              <button className="btn">Send</button>
              <button type="button" className="btn secondary" onClick={() => setCompose(null)}>Cancel</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
