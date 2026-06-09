import { useEffect, useState, useCallback } from 'react';
import { api } from '../lib/api.js';
import Scan from './admin/Scan.jsx';

// Standalone door-staff scanner at /scan — separate from the /admin panel.
// Its own password gate; access is limited to the door_staff and admin roles,
// so check-in staff never see the admin panel.
export default function ScanGate() {
  const [me, setMe] = useState(undefined); // undefined = loading, null = signed out
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const check = useCallback(() => api('/auth/me').then(({ user }) => setMe(user)).catch(() => setMe(null)), []);
  useEffect(() => { check(); }, [check]);

  async function login(e) {
    e.preventDefault();
    setBusy(true); setErr('');
    try { await api('/auth/login', { method: 'POST', body: { email, password } }); await check(); }
    catch (er) { setErr(er.message || 'Sign in failed'); }
    finally { setBusy(false); }
  }
  async function logout() { await api('/auth/logout', { method: 'POST' }).catch(() => {}); setMe(null); }

  if (me === undefined) return <div className="section container"><p className="muted">Loading…</p></div>;

  const allowed = me && ['door_staff', 'admin'].includes(me.role);
  if (!allowed) {
    return (
      <div className="section container" style={{ maxWidth: 420 }}>
        <h1 className="glow">Staff Check-in</h1>
        {me && <p style={{ color: 'var(--color-danger)' }}>This account doesn’t have scanner access.</p>}
        <form className="card" onSubmit={login}>
          <p className="muted">Door staff sign-in.</p>
          <label>Email</label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          <label>Password</label>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          {err && <p style={{ color: 'var(--color-danger)' }}>{err}</p>}
          <div style={{ marginTop: 12 }}><button className="btn" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button></div>
          {me && <div style={{ marginTop: 10 }}><button type="button" className="btn secondary" onClick={logout}>Sign out</button></div>}
        </form>
      </div>
    );
  }

  return (
    <div className="section container">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <span className="muted">{me.email} · {me.role}</span>
        <button className="btn secondary" onClick={logout}>Log out</button>
      </div>
      <Scan />
    </div>
  );
}
