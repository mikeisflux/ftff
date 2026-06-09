import { useEffect, useRef, useState } from 'react';

// Live chat panel for the Virtual Con (§11). Connects to the WebSocket gated by
// the stream entitlement token; shows history, broadcasts messages, removes
// moderated ones live, and auto-reconnects.
export default function LiveChat({ token }) {
  const [messages, setMessages] = useState([]);
  const [status, setStatus] = useState('connecting'); // connecting | open | closed
  const [handle, setHandle] = useState(() => localStorage.getItem('chat-handle') || '');
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const wsRef = useRef(null);
  const listRef = useRef(null);
  const retryRef = useRef(null);

  useEffect(() => {
    let closed = false;
    function connect() {
      const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
      const ws = new WebSocket(`${proto}://${window.location.host}/ws/chat?token=${encodeURIComponent(token)}`);
      wsRef.current = ws;
      ws.onopen = () => setStatus('open');
      ws.onclose = () => {
        if (closed) return;
        setStatus('closed');
        retryRef.current = setTimeout(connect, 2500); // auto-reconnect
      };
      ws.onmessage = (e) => {
        let m;
        try { m = JSON.parse(e.data); } catch { return; }
        if (m.type === 'history') setMessages(m.messages);
        else if (m.type === 'msg') setMessages((prev) => [...prev.slice(-200), m]);
        else if (m.type === 'hide') setMessages((prev) => prev.filter((x) => x.id !== m.id));
        else if (m.type === 'error') setError(m.error);
      };
    }
    connect();
    return () => { closed = true; clearTimeout(retryRef.current); wsRef.current?.close(); };
  }, [token]);

  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [messages]);

  function send(e) {
    e.preventDefault();
    setError('');
    const body = text.trim();
    if (!body || status !== 'open') return;
    if (handle) localStorage.setItem('chat-handle', handle);
    wsRef.current.send(JSON.stringify({ type: 'msg', handle: handle || 'Guest', body }));
    setText('');
  }

  return (
    <div className="card live-chat">
      <h3 style={{ marginTop: 0 }}>Live Chat {status !== 'open' && <span className="muted" style={{ fontSize: 12 }}>· {status}</span>}</h3>
      <div ref={listRef} className="chat-log">
        {messages.length === 0 && <p className="muted">Say hi! 👋</p>}
        {messages.map((m) => (
          <div key={m.id} className="chat-line">
            <strong style={{ color: m.role === 'staff' ? 'var(--color-accent)' : 'var(--color-secondary)' }}>
              {m.handle}{m.role === 'staff' ? ' ★' : ''}:
            </strong>{' '}
            <span>{m.body}</span>
          </div>
        ))}
      </div>
      {error && <p style={{ color: 'var(--color-danger)', fontSize: 12 }}>{error}</p>}
      <form onSubmit={send} style={{ display: 'grid', gap: 6 }}>
        <input value={handle} onChange={(e) => setHandle(e.target.value)} placeholder="Your name" maxLength={32} />
        <div style={{ display: 'flex', gap: 6 }}>
          <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Message" maxLength={500} />
          <button className="btn" disabled={status !== 'open'}>Send</button>
        </div>
      </form>
    </div>
  );
}
