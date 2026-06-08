import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../lib/api.js';

// Settings panel with the mandated click-to-set → confirm-to-save UX (§5).
// Each field is locked until "Set / Edit"; secrets show a mask and are never
// returned by the API.
function SettingRow({ s, onSaved }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  const dirty = editing && value.length > 0;

  async function save() {
    setBusy(true);
    try {
      await api(`/admin/settings/${encodeURIComponent(s.key)}`, {
        method: 'PUT',
        body: { value },
      });
      setEditing(false);
      setValue('');
      setSaved(true);
      onSaved();
    } finally {
      setBusy(false);
    }
  }

  async function clear() {
    setBusy(true);
    try {
      await api(`/admin/settings/${encodeURIComponent(s.key)}`, { method: 'DELETE' });
      onSaved();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card" style={{ marginBottom: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <strong>{s.label}</strong>
        <span className="muted" style={{ fontSize: '.8rem' }}>{s.key}{s.isSecret ? ' · secret' : ''}</span>
      </div>
      {s.description && <p className="muted" style={{ margin: '4px 0' }}>{s.description}</p>}

      {!editing ? (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <code style={{ flex: 1 }}>
            {s.isSet ? (s.isSecret ? '••••••••' : s.value) : <span className="muted">— not set —</span>}
          </code>
          {saved && <span style={{ color: 'var(--color-success)' }}>Saved ✓</span>}
          <button className="btn secondary" onClick={() => { setEditing(true); setSaved(false); }}>
            Set / Edit
          </button>
          {s.isSet && (
            <button className="btn secondary" onClick={clear} disabled={busy}>Clear</button>
          )}
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input
            type={s.isSecret ? 'password' : 'text'}
            autoFocus
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={s.isSecret ? 'Enter secret value' : 'Enter value'}
          />
          {dirty && <span className="muted">unsaved</span>}
          <button className="btn" onClick={save} disabled={busy || !value}>Confirm &amp; Save</button>
          <button className="btn secondary" onClick={() => { setEditing(false); setValue(''); }}>
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}

export default function Settings() {
  const nav = useNavigate();
  const [settings, setSettings] = useState([]);
  const [error, setError] = useState('');

  async function load() {
    try {
      const { settings } = await api('/admin/settings');
      setSettings(settings);
    } catch (err) {
      if (err.status === 401) nav('/admin/login');
      else setError(err.message);
    }
  }

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Warn before navigating away with unsaved edits is handled per-field; here we
  // group by category.
  const cats = [...new Set(settings.map((s) => s.category))];

  return (
    <div className="section container">
      <h1 className="glow">Settings</h1>
      {error && <p style={{ color: 'var(--color-danger)' }}>{error}</p>}
      {cats.map((cat) => (
        <section key={cat} style={{ marginBottom: 28 }}>
          <h2>{cat}</h2>
          {settings.filter((s) => s.category === cat).map((s) => (
            <SettingRow key={s.key} s={s} onSaved={load} />
          ))}
        </section>
      ))}
    </div>
  );
}
