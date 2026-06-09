import { useEffect, useRef, useState } from 'react';
import Hls from 'hls.js';
import { api } from '../lib/api.js';
import LiveChat from '../components/LiveChat.jsx';

// LIVE — Virtual Con Experience (§11): gated to Digital ticket holders, who log
// in with the confirmation (order) number + email from their purchase. The
// server validates the paid Digital order and mints a short-lived access token.
export default function Virtual() {
  const videoRef = useRef(null);
  const [access, setAccess] = useState(null); // { token, hls, streamConfigured }
  const [orderNumber, setOrderNumber] = useState('');
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState({ configured: false, live: false });
  const [vod, setVod] = useState([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => { api('/virtual/status').then(setStatus).catch(() => {}); }, []);

  async function unlock(e) {
    e?.preventDefault();
    setBusy(true);
    setError('');
    try {
      const res = await api('/virtual/playback-token', { method: 'POST', body: { orderNumber, email } });
      setAccess(res);
      const vodRes = await api(`/virtual/vod?token=${encodeURIComponent(res.token)}`).catch(() => ({ vod: [] }));
      setVod(vodRes.vod || []);
    } catch (err) {
      setError(err.message || 'Could not verify your purchase.');
    } finally {
      setBusy(false);
    }
  }

  // Attach the HLS stream once we have an access URL.
  useEffect(() => {
    const url = access?.hls;
    const video = videoRef.current;
    if (!url || !video) return undefined;
    if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = url; // native HLS (Safari)
      return undefined;
    }
    if (Hls.isSupported()) {
      const hls = new Hls();
      hls.loadSource(url);
      hls.attachMedia(video);
      return () => hls.destroy();
    }
    return undefined;
  }, [access]);

  return (
    <div className="section container" style={{ maxWidth: 900 }}>
      <h1 className="glow">Virtual Con Experience</h1>

      {!access ? (
        <form className="card" style={{ maxWidth: 520 }} onSubmit={unlock}>
          <p className="muted">
            Digital ticket holders: enter the <strong>confirmation number</strong> and{' '}
            <strong>email</strong> from your purchase to watch the livestream and past sessions.
          </p>
          <label>Confirmation number</label>
          <input value={orderNumber} onChange={(e) => setOrderNumber(e.target.value)} placeholder="e.g. FFF-LZ4K9P-A1B2" required />
          <label>Email</label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="The email you bought with" required />
          {error && <p style={{ color: 'var(--color-danger)' }}>{error}</p>}
          <div style={{ marginTop: 12 }}>
            <button className="btn" disabled={busy}>{busy ? 'Verifying…' : 'Enter the stream'}</button>
          </div>
          <p className="muted" style={{ marginTop: 10, fontSize: '.85rem' }}>
            Stream is currently {status.live ? 'LIVE 🔴' : status.configured ? 'offline' : 'not yet scheduled'}.
          </p>
        </form>
      ) : (
        <>
          <div className="virtual-stage">
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
              {access.hls ? (
                <video ref={videoRef} controls playsInline style={{ width: '100%', background: '#000', aspectRatio: '16/9' }} />
              ) : (
                <div style={{ aspectRatio: '16/9', display: 'grid', placeItems: 'center', background: '#000' }}>
                  <p className="muted">You’re in! The stream is offline right now — check back at showtime.</p>
                </div>
              )}
            </div>
            {access.chatEnabled && <LiveChat token={access.token} />}
          </div>

          {vod.length > 0 && (
            <section style={{ marginTop: 20 }}>
              <h2>Past sessions</h2>
              <div className="grid cols-3">
                {vod.map((v) => (
                  <button key={v.uid} className="card" onClick={() => setAccess((a) => ({ ...a, hls: v.hls }))}>
                    {v.thumbnail && <img src={v.thumbnail} alt={v.name} style={{ width: '100%', borderRadius: 8 }} />}
                    <h3>{v.name}</h3>
                  </button>
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
