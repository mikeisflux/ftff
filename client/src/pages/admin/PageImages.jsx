import { useEffect, useState, useCallback } from 'react';
import { api, uploadFile } from '../../lib/api.js';
import { PAGE_IMAGE_GROUPS } from '../../lib/pageImages.js';

// Swap the fixed images used on bespoke pages (Exhibitor Rewards, Social Media
// Tool Kit). Upload a replacement per slot, or reset to the built-in default.
export default function PageImages() {
  const [overrides, setOverrides] = useState({});
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState('');

  const load = useCallback(async () => {
    try { setOverrides((await api('/admin/images')).overrides || {}); } catch (e) { setMsg(e.message); }
  }, []);
  useEffect(() => { load(); }, [load]);

  async function upload(slot, file) {
    if (!file) return;
    setBusy(slot); setMsg('');
    try {
      const { url } = await uploadFile('/admin/uploads', file);
      await api(`/admin/images/${slot}`, { method: 'PUT', body: { url } });
      setOverrides((o) => ({ ...o, [slot]: url }));
      setMsg('Image updated ✓');
    } catch (e) { setMsg(e.message || 'Upload failed'); }
    finally { setBusy(''); }
  }

  async function reset(slot) {
    setBusy(slot); setMsg('');
    try {
      await api(`/admin/images/${slot}`, { method: 'DELETE' });
      setOverrides((o) => { const n = { ...o }; delete n[slot]; return n; });
      setMsg('Reset to default ✓');
    } catch (e) { setMsg(e.message); }
    finally { setBusy(''); }
  }

  return (
    <div>
      <h1 className="glow">Page Images</h1>
      <p className="muted" style={{ maxWidth: 720 }}>
        Swap the pictures used on these pages. Upload a replacement for any slot, or reset it back to the built-in
        default. Changes appear on the live site immediately.
      </p>
      {msg && <p className="muted">{msg}</p>}

      {PAGE_IMAGE_GROUPS.map((g) => (
        <section key={g.page} style={{ marginTop: 28 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
            <h2 className="glow" style={{ margin: 0 }}>{g.page}</h2>
            <a className="muted" href={g.path} target="_blank" rel="noreferrer" style={{ fontSize: '.9rem' }}>view page ↗</a>
          </div>
          <div className="grid cols-3" style={{ marginTop: 12 }}>
            {g.slots.map((s) => {
              const current = overrides[s.key] || s.default;
              const isOverridden = Boolean(overrides[s.key]);
              return (
                <div className="card" key={s.key} style={{ padding: 12 }}>
                  <div style={{ fontWeight: 600, marginBottom: 6 }}>{s.label}</div>
                  <img src={current} alt={s.label} style={{ width: '100%', borderRadius: 8, display: 'block', background: 'rgba(255,255,255,.04)' }} />
                  <p className="muted" style={{ fontSize: '.8rem', margin: '8px 0 6px' }}>
                    {isOverridden ? 'Custom image' : 'Default image'}
                  </p>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <label className="btn secondary" style={{ cursor: 'pointer', margin: 0 }}>
                      {busy === s.key ? 'Working…' : 'Upload'}
                      <input
                        type="file"
                        accept="image/*"
                        style={{ display: 'none' }}
                        disabled={busy === s.key}
                        onChange={(e) => upload(s.key, e.target.files?.[0])}
                      />
                    </label>
                    {isOverridden && (
                      <button className="btn secondary" disabled={busy === s.key} onClick={() => reset(s.key)}>Reset</button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
