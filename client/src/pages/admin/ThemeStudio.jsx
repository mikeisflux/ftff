import { useEffect, useState } from 'react';
import { api, uploadFile } from '../../lib/api.js';

const TOKENS = ['primary', 'secondary', 'accent', 'background', 'surface', 'text', 'muted', 'success', 'danger'];
const PRESETS = {
  'Neon Cyber': { primary: '#7c3aed', secondary: '#06b6d4', accent: '#ec4899' },
  Synthwave: { primary: '#ff2e97', secondary: '#22d3ee', accent: '#f59e0b' },
  'Holo Mono': { primary: '#64748b', secondary: '#38bdf8', accent: '#a3e635' },
};

// Theme & Branding studio (§13.3): edit dark/light palettes, glow, fonts; logo/
// favicon uploads. Confirm-to-save like Settings; values validated server-side.
export default function ThemeStudio() {
  const [theme, setTheme] = useState(null);
  const [mode, setMode] = useState('dark');
  const [dirty, setDirty] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => { api('/admin/theme').then((d) => setTheme(d.theme)).catch(() => {}); }, []);
  if (!theme) return <div><h1 className="glow">Theme &amp; Branding</h1><p className="muted">Loading…</p></div>;

  const palette = theme.tokens?.[mode] || {};
  const setColor = (k, v) => { setTheme((t) => ({ ...t, tokens: { ...t.tokens, [mode]: { ...t.tokens[mode], [k]: v } } })); setDirty(true); };
  const setField = (k, v) => { setTheme((t) => ({ ...t, [k]: v })); setDirty(true); };
  const applyPreset = (p) => { setTheme((t) => ({ ...t, tokens: { ...t.tokens, [mode]: { ...t.tokens[mode], ...PRESETS[p] } }, glow_color: PRESETS[p].primary })); setDirty(true); };

  async function onLogo(field, file) {
    try { const { url } = await uploadFile('/admin/uploads', file); setField(field, url); }
    catch (err) { setMsg(err.message); }
  }

  async function save() {
    setMsg('');
    try {
      await api('/admin/theme', { method: 'PUT', body: {
        tokens: theme.tokens, glow_color: theme.glow_color, glow_intensity: Number(theme.glow_intensity),
        font_display: theme.font_display, font_body: theme.font_body, radius: theme.radius,
        default_mode: theme.default_mode, allow_user_toggle: theme.allow_user_toggle,
        logo_url: theme.logo_url || null, logo_dark_url: theme.logo_dark_url || null,
        logo_light_url: theme.logo_light_url || null, favicon_url: theme.favicon_url || null,
      } });
      setDirty(false); setMsg('Saved ✓ — reload the public site to see changes.');
    } catch (err) { setMsg(err.data?.details?.[0]?.message || err.message); }
  }

  return (
    <div>
      <h1 className="glow">Theme &amp; Branding</h1>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <button className={mode === 'dark' ? 'btn' : 'btn secondary'} onClick={() => setMode('dark')}>Dark palette</button>
        <button className={mode === 'light' ? 'btn' : 'btn secondary'} onClick={() => setMode('light')}>Light palette</button>
        {Object.keys(PRESETS).map((p) => <button key={p} type="button" className="btn secondary" onClick={() => applyPreset(p)}>{p}</button>)}
      </div>
      {msg && <p className="muted">{msg}</p>}

      <div className="card" style={{ marginBottom: 16 }}>
        <h3>{mode} colors</h3>
        <div className="grid cols-3">
          {TOKENS.map((k) => (
            <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input type="color" value={palette[k] || '#000000'} onChange={(e) => setColor(k, e.target.value)} style={{ width: 44, height: 36, padding: 0 }} />
              <span>{k}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <h3>Glow, shape &amp; type</h3>
        <div className="grid cols-3">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><span>Glow</span><input type="color" value={theme.glow_color || '#7c3aed'} onChange={(e) => setField('glow_color', e.target.value)} /></div>
          <div><label>Glow intensity ({theme.glow_intensity})</label><input type="range" min="0" max="100" value={theme.glow_intensity} onChange={(e) => setField('glow_intensity', e.target.value)} /></div>
          <div><label>Radius</label><input value={theme.radius} onChange={(e) => setField('radius', e.target.value)} placeholder="12px" /></div>
          <div><label>Display font</label><input value={theme.font_display} onChange={(e) => setField('font_display', e.target.value)} /></div>
          <div><label>Body font</label><input value={theme.font_body} onChange={(e) => setField('font_body', e.target.value)} /></div>
          <div><label>Default mode</label><select value={theme.default_mode} onChange={(e) => setField('default_mode', e.target.value)}><option value="dark">dark</option><option value="light">light</option></select></div>
        </div>
        <label style={{ display: 'inline-flex', gap: 8, alignItems: 'center', marginTop: 10 }}>
          <input type="checkbox" style={{ width: 'auto' }} checked={theme.allow_user_toggle} onChange={(e) => setField('allow_user_toggle', e.target.checked)} /> Allow visitors to toggle dark/light
        </label>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <h3>Branding</h3>
        {[['logo_dark_url', 'Logo (dark mode)'], ['logo_light_url', 'Logo (light mode)'], ['favicon_url', 'Favicon']].map(([field, label]) => (
          <div key={field} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
            <span style={{ width: 140 }}>{label}</span>
            {theme[field] && <img src={theme[field]} alt="" style={{ height: 32 }} />}
            <input type="file" accept="image/*" onChange={(e) => e.target.files[0] && onLogo(field, e.target.files[0])} style={{ width: 'auto' }} />
          </div>
        ))}
      </div>

      <button className="btn" onClick={save} disabled={!dirty}>Confirm &amp; Save</button>
      {dirty && <span className="muted" style={{ marginLeft: 10 }}>unsaved changes</span>}
    </div>
  );
}
