import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../lib/api.js';

// Admin livestream control (§11): create/inspect the live input (RTMPS ingest
// for the production team's encoder), see state, and view the VOD library.
export default function Stream() {
  const [data, setData] = useState(null);
  const [vod, setVod] = useState([]);
  const [msg, setMsg] = useState('');

  const load = useCallback(async () => {
    const d = await api('/admin/stream');
    setData(d);
    if (d.configured) {
      api('/admin/stream/vod').then((r) => setVod(r.vod)).catch(() => {});
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  async function createInput() {
    setMsg('');
    try { await api('/admin/stream/live-input', { method: 'POST', body: { name: 'Virtual Con Live' } }); await load(); }
    catch (err) { setMsg(err.message); }
  }

  if (!data) return <div><h1 className="glow">Livestream</h1><p className="muted">Loading…</p></div>;

  if (!data.configured) {
    return (
      <div>
        <h1 className="glow">Livestream</h1>
        <div className="card">
          <p>Cloudflare Stream isn’t configured yet.</p>
          <p className="muted">Add <code>cloudflare.account_id</code> and <code>cloudflare.stream_api_token</code> in <Link to="/admin/settings">Settings</Link>, then create a live input here.</p>
        </div>
      </div>
    );
  }

  const li = data.liveInput;
  return (
    <div>
      <h1 className="glow">Livestream</h1>
      {msg && <p style={{ color: 'var(--color-danger)' }}>{msg}</p>}
      {data.error && <p style={{ color: 'var(--color-danger)' }}>{data.error}</p>}

      {!li ? (
        <div className="card">
          <p>No live input yet.</p>
          <button className="btn" onClick={createInput}>Create live input</button>
        </div>
      ) : (
        <div className="card">
          <p>State: <strong>{li.state}</strong></p>
          <h3>Encoder ingest (give these to your production team)</h3>
          <p className="muted">Push RTMPS from OBS / hardware encoder:</p>
          <p><strong>URL:</strong> <code>{li.rtmps?.url}</code></p>
          <p><strong>Stream key:</strong> <code>{li.rtmps?.streamKey}</code></p>
          <p className="muted" style={{ fontSize: '.85rem' }}>Cloudflare transcodes RTMP ingest and delivers HLS to viewers on the gated /virtual page.</p>
        </div>
      )}

      <h2 style={{ marginTop: 24 }}>VOD library</h2>
      {vod.length === 0 ? <p className="muted">No recordings yet.</p> : (
        <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr style={{ textAlign: 'left' }}><th style={{ padding: 10 }}>Name</th><th>Duration</th><th>Ready</th></tr></thead>
            <tbody>
              {vod.map((v) => (
                <tr key={v.uid} style={{ borderTop: '1px solid rgba(255,255,255,.08)' }}>
                  <td style={{ padding: 10 }}>{v.name || v.uid}</td><td>{Math.round(v.duration || 0)}s</td><td>{v.ready ? '✓' : '…'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
