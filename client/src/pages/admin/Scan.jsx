import { useEffect, useRef, useState } from 'react';
import { api } from '../../lib/api.js';

// Door-staff QR scanner (§8). Uses the native BarcodeDetector when available
// (Chrome/Android); always offers manual token entry as a fallback so it works
// on any device and on flaky venue wifi. Server is the source of truth.
function extractToken(raw) {
  const m = String(raw).match(/\/t\/([a-f0-9]{16,})/i);
  return m ? m[1] : String(raw).trim();
}

const RESULT_STYLE = {
  checked_in: { color: 'var(--color-success)', label: '✓ Checked in' },
  already_checked_in: { color: '#f59e0b', label: '⚠ Already checked in' },
  void: { color: 'var(--color-danger)', label: '✕ Void ticket' },
  not_found: { color: 'var(--color-danger)', label: '✕ Not found' },
};

export default function Scan() {
  const videoRef = useRef(null);
  const scanningRef = useRef(false);
  const [supported, setSupported] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [manual, setManual] = useState('');
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const lastToken = useRef({ token: null, at: 0 });

  useEffect(() => {
    setSupported('BarcodeDetector' in window);
  }, []);

  async function validate(token) {
    if (!token) return;
    // Debounce repeat scans of the same code.
    const now = Date.now();
    if (lastToken.current.token === token && now - lastToken.current.at < 3000) return;
    lastToken.current = { token, at: now };
    setBusy(true);
    try {
      const res = await api('/validate', { method: 'POST', body: { qr_token: token } });
      setResult(res);
    } catch (err) {
      setResult({ result: err.status === 404 ? 'not_found' : 'error', error: err.message });
    } finally {
      setBusy(false);
    }
  }

  async function startCamera() {
    if (!('BarcodeDetector' in window)) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
      });
      videoRef.current.srcObject = stream;
      await videoRef.current.play();
      setScanning(true);
      const detector = new window.BarcodeDetector({ formats: ['qr_code'] });
      const tick = async () => {
        if (!videoRef.current || videoRef.current.readyState !== 4) {
          if (scanningRef.current) requestAnimationFrame(tick);
          return;
        }
        try {
          const codes = await detector.detect(videoRef.current);
          if (codes[0]) validate(extractToken(codes[0].rawValue));
        } catch {
          /* ignore per-frame errors */
        }
        if (scanningRef.current) requestAnimationFrame(tick);
      };
      scanningRef.current = true;
      requestAnimationFrame(tick);
    } catch {
      setSupported(false);
    }
  }

  function stopCamera() {
    scanningRef.current = false;
    setScanning(false);
    const stream = videoRef.current?.srcObject;
    stream?.getTracks().forEach((t) => t.stop());
  }
  useEffect(() => () => stopCamera(), []);

  const rs = result && (RESULT_STYLE[result.result] || { color: 'var(--color-danger)', label: result.error || 'Error' });

  return (
    <div style={{ maxWidth: 480 }}>
      <h1 className="glow">Check-in Scanner</h1>

      {supported ? (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <video ref={videoRef} style={{ width: '100%', display: scanning ? 'block' : 'none' }} muted playsInline />
          <div style={{ padding: 12 }}>
            {!scanning ? (
              <button className="btn" onClick={startCamera}>Start camera</button>
            ) : (
              <button className="btn secondary" onClick={stopCamera}>Stop camera</button>
            )}
          </div>
        </div>
      ) : (
        <p className="muted">Camera scanning isn’t available on this device — use manual entry below.</p>
      )}

      <form
        className="card"
        style={{ marginTop: 16 }}
        onSubmit={(e) => { e.preventDefault(); validate(extractToken(manual)); }}
      >
        <label>Manual token / scanned URL</label>
        <input value={manual} onChange={(e) => setManual(e.target.value)} placeholder="Paste token or ticket URL" />
        <div style={{ marginTop: 12 }}>
          <button className="btn" disabled={busy}>Validate</button>
        </div>
      </form>

      {result && (
        <div className="card" style={{ marginTop: 16, borderColor: rs.color }}>
          <h2 style={{ color: rs.color, marginTop: 0 }}>{rs.label}</h2>
          {result.ticket && (
            <>
              <p><strong>{result.ticket.ticketName}</strong></p>
              <p className="muted">{result.ticket.attendeeName}</p>
              <p className="muted">Order {result.ticket.orderNumber}</p>
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
