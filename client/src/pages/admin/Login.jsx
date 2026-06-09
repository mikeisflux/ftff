import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../lib/api.js';

export default function Login() {
  const nav = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const { user } = await api('/auth/login', { method: 'POST', body: { email, password } });
      // Door staff go to the standalone scanner; others to the admin dashboard.
      nav(user.role === 'door_staff' ? '/scan' : '/admin/dashboard');
    } catch (err) {
      setError(err.message || 'Login failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="section container" style={{ maxWidth: 420 }}>
      <h1 className="glow">Admin Login</h1>
      <form onSubmit={submit} className="card">
        <label>Email</label>
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <label>Password</label>
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        {error && <p style={{ color: 'var(--color-danger)' }}>{error}</p>}
        <div style={{ marginTop: 16 }}>
          <button className="btn" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
        </div>
      </form>
    </div>
  );
}
