import { useEffect, useRef, useState, useCallback } from 'react';
import { api } from '../../lib/api.js';

// Door-staff QR scanner (§8) with OFFLINE support. When online it validates
// live; when offline it validates against a cached manifest and queues the
// check-in, syncing automatically when connectivity returns. Camera via the
// native BarcodeDetector with a manual-entry fallback. Server is the source of
// truth; offline check-ins are optimistic and reconciled on sync.
const MANIFEST_KEY = 'scan-manifest';
const QUEUE_KEY = 'scan-queue';

function extractToken(raw) {
  const m = String(raw).match(/\/t\/([a-f0-9]{16,})/i);
  return m ? m[1] : String(raw).trim();
}
const RESULT_STYLE = {
  checked_in: { color: 'var(--color-success)', label: '✓ Checked in' },
  queued: { color: 'var(--color-success)', label: '✓ Checked in (offline — will sync)' },
  already_checked_in: { color: '#f59e0b', label: '⚠ Already checked in' },
  void: { color: 'var(--color-danger)', label: '✕ Void ticket' },
  not_found: { color: 'var(--color-danger)', label: '✕ Not found' },
};

const loadJson = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
const saveJson = (k, v) => localStorage.setItem(k, JSON.stringify(v));

export default function Scan() {
  const videoRef = useRef(null);
  const scanningRef = useRef(false);
  const lastToken = useRef({ token: null, at: 0 });

  const [supported, setSupported] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [manual, setManual] = useState('');
  const [result, setResult] = useState(null);
  const [online, setOnline] = useState(navigator.onLine);
  const [manifest, setManifest] = useState(() => loadJson(MANIFEST_KEY, null)); // { generatedAt, map:{token:status} }
  const [queue, setQueue] = useState(() => loadJson(QUEUE_KEY, []));
  const [syncMsg, setSyncMsg] = useState('');

  useEffect(() => { setSupported('BarcodeDetector' in window); }, []);
  useEffect(() => { saveJson(QUEUE_KEY, queue); }, [queue]);

  const downloadManifest = useCallback(async () => {
    try {
      const { generatedAt, tickets } = await api('/validate/manifest');
      const map = {};
      for (const t of tickets) map[t.qr_token] = { status: t.status, name: t.attendeeName, ticket: t.ticketName, order: t.orderNumber, checkedInAt: t.checkedInAt };
      const m = { generatedAt, map };
      setManifest(m); saveJson(MANIFEST_KEY, m);
      setSyncMsg(`Manifest updated (${tickets.length} tickets).`);
    } catch (err) {
      setSyncMsg(`Manifest download failed: ${err.message}`);
    }
  }, []);

  const syncQueue = useCallback(async () => {
    const pending = loadJson(QUEUE_KEY, []);
    if (pending.length === 0 || !navigator.onLine) return;
    setSyncMsg(`Syncing ${pending.length} offline check-in(s)…`);
    try {
      const { results } = await api('/validate/batch', { method: 'POST', body: { checkins: pending } });
      const conflicts = results.filter((r) => r.result === 'already_checked_in').length;
      setQueue([]);
      setSyncMsg(`Synced ${results.length} check-in(s)${conflicts ? `, ${conflicts} already checked in elsewhere` : ''}.`);
      downloadManifest();
    } catch (err) {
      setSyncMsg(`Sync failed (will retry): ${err.message}`);
    }
  }, [downloadManifest]);

  // Online/offline transitions.
  useEffect(() => {
    function goOnline() { setOnline(true); syncQueue(); }
    function goOffline() { setOnline(false); }
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => { window.removeEventListener('online', goOnline); window.removeEventListener('offline', goOffline); };
  }, [syncQueue]);

  // On first load while online: refresh manifest + flush any queue.
  useEffect(() => { if (navigator.onLine) { downloadManifest(); syncQueue(); } }, [downloadManifest, syncQueue]);

  const validateOffline = useCallback((token) => {
    const entry = manifest?.map?.[token];
    if (!entry) return { result: 'not_found' };
    if (entry.status === 'checked_in') return { result: 'already_checked_in', ticket: { ticketName: entry.ticket, attendeeName: entry.name, orderNumber: entry.order, checkedInAt: entry.checkedInAt } };
    // Mark locally checked in + queue.
    entry.status = 'checked_in';
    entry.checkedInAt = new Date().toISOString();
    setManifest((m) => { const next = { ...m }; saveJson(MANIFEST_KEY, next); return next; });
    setQueue((q) => [...q, { qr_token: token, at: entry.checkedInAt }]);
    return { result: 'queued', ticket: { ticketName: entry.ticket, attendeeName: entry.name, orderNumber: entry.order } };
  }, [manifest]);

  const validate = useCallback(async (token) => {
    if (!token) return;
    const now = Date.now();
    if (lastToken.current.token === token && now - lastToken.current.at < 3000) return;
    lastToken.current = { token, at: now };

    if (navigator.onLine) {
      try {
        const res = await api('/validate', { method: 'POST', body: { qr_token: token } });
        if (manifest?.map?.[token]) { manifest.map[token].status = 'checked_in'; saveJson(MANIFEST_KEY, manifest); }
        setResult(res);
      } catch (err) {
        // Network blip mid-scan → fall back to offline path.
        if (err.status === 404) setResult({ result: 'not_found' });
        else setResult(validateOffline(token));
      }
    } else {
      setResult(validateOffline(token));
    }
  }, [manifest, validateOffline]);

  async function startCamera() {
    if (!('BarcodeDetector' in window)) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      videoRef.current.srcObject = stream;
      await videoRef.current.play();
      setScanning(true);
      const detector = new window.BarcodeDetector({ formats: ['qr_code'] });
      scanningRef.current = true;
      const tick = async () => {
        if (videoRef.current?.readyState === 4) {
          try { const codes = await detector.detect(videoRef.current); if (codes[0]) validate(extractToken(codes[0].rawValue)); } catch { /* ignore */ }
        }
        if (scanningRef.current) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    } catch { setSupported(false); }
  }
  function stopCamera() {
    scanningRef.current = false; setScanning(false);
    videoRef.current?.srcObject?.getTracks().forEach((t) => t.stop());
  }
  useEffect(() => () => stopCamera(), []);

  const rs = result && (RESULT_STYLE[result.result] || { color: 'var(--color-danger)', label: result.error || 'Error' });
  const manifestCount = manifest ? Object.keys(manifest.map).length : 0;

  return (
    <div style={{ maxWidth: 480 }}>
      <h1 className="glow">Check-in Scanner</h1>

      <div className="card" style={{ marginBottom: 12, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <span style={{ color: online ? 'var(--color-success)' : '#f59e0b', fontWeight: 700 }}>
          {online ? '● Online' : '○ Offline'}
        </span>
        <span className="muted" style={{ fontSize: 13 }}>
          Cached: {manifestCount} · Queued: {queue.length}
          {manifest?.generatedAt ? ` · as of ${new Date(manifest.generatedAt).toLocaleTimeString()}` : ''}
        </span>
        <span style={{ flex: 1 }} />
        <button className="btn secondary" onClick={downloadManifest} disabled={!online}>Refresh manifest</button>
        {queue.length > 0 && <button className="btn" onClick={syncQueue} disabled={!online}>Sync ({queue.length})</button>}
      </div>
      {syncMsg && <p className="muted" style={{ fontSize: 13 }}>{syncMsg}</p>}
      {!online && manifestCount === 0 && (
        <p style={{ color: 'var(--color-danger)' }}>No cached manifest — connect once to download tickets for offline use.</p>
      )}

      {supported ? (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <video ref={videoRef} style={{ width: '100%', display: scanning ? 'block' : 'none' }} muted playsInline />
          <div style={{ padding: 12 }}>
            {!scanning
              ? <button className="btn" onClick={startCamera}>Start camera</button>
              : <button className="btn secondary" onClick={stopCamera}>Stop camera</button>}
          </div>
        </div>
      ) : (
        <p className="muted">Camera scanning isn’t available — use manual entry below.</p>
      )}

      <form className="card" style={{ marginTop: 16 }} onSubmit={(e) => { e.preventDefault(); validate(extractToken(manual)); setManual(''); }}>
        <label>Manual token / scanned URL</label>
        <input value={manual} onChange={(e) => setManual(e.target.value)} placeholder="Paste token or ticket URL" />
        <div style={{ marginTop: 12 }}><button className="btn">Validate</button></div>
      </form>

      {result && (
        <div className="card" style={{ marginTop: 16, borderColor: rs.color }}>
          <h2 style={{ color: rs.color, marginTop: 0 }}>{rs.label}</h2>
          {result.ticket && (
            <>
              <p><strong>{result.ticket.ticketName}</strong></p>
              <p className="muted">{result.ticket.attendeeName}</p>
              {result.ticket.orderNumber && <p className="muted">Order {result.ticket.orderNumber}</p>}
              {result.result === 'already_checked_in' && result.ticket.checkedInAt && (
                <p className="muted">First scanned: {new Date(result.ticket.checkedInAt).toLocaleString()}</p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
