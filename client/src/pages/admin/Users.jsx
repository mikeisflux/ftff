import { useEffect, useState, useCallback } from 'react';
import { useOutletContext } from 'react-router-dom';
import { api } from '../../lib/api.js';

const ROLES = ['admin', 'editor', 'door_staff'];
const blank = { email: '', name: '', role: 'editor', password: '' };

// Users & roles (§13), admin only.
export default function Users() {
  const { me } = useOutletContext();
  const [users, setUsers] = useState([]);
  const [form, setForm] = useState(blank);
  const [msg, setMsg] = useState('');

  const load = useCallback(async () => { setUsers((await api('/admin/users')).users); }, []);
  useEffect(() => { load(); }, [load]);

  async function create(e) {
    e.preventDefault();
    setMsg('');
    try { await api('/admin/users', { method: 'POST', body: form }); setForm(blank); await load(); }
    catch (err) { setMsg(err.data?.details?.[0]?.message || err.message); }
  }
  async function update(id, patch) {
    setMsg('');
    try { await api(`/admin/users/${id}`, { method: 'PUT', body: patch }); await load(); }
    catch (err) { setMsg(err.message); }
  }
  async function resetPw(id) {
    const password = window.prompt('New password (min 12 chars):');
    if (!password) return;
    try { await api(`/admin/users/${id}/password`, { method: 'POST', body: { password } }); setMsg('Password reset.'); }
    catch (err) { setMsg(err.message); }
  }
  async function del(id) {
    if (!window.confirm('Delete this user?')) return;
    try { await api(`/admin/users/${id}`, { method: 'DELETE' }); await load(); }
    catch (err) { setMsg(err.message); }
  }

  return (
    <div>
      <h1 className="glow">Users &amp; Roles</h1>
      {msg && <p className="muted">{msg}</p>}

      <form className="card" onSubmit={create} style={{ marginBottom: 16 }}>
        <h3>Add user</h3>
        <div className="grid cols-4">
          <div><label>Email</label><input type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} required /></div>
          <div><label>Name</label><input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} required /></div>
          <div><label>Role</label><select value={form.role} onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}>{ROLES.map((r) => <option key={r}>{r}</option>)}</select></div>
          <div><label>Password (12+)</label><input type="password" value={form.password} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} required minLength={12} /></div>
        </div>
        <div style={{ marginTop: 12 }}><button className="btn">Create user</button></div>
      </form>

      <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr style={{ textAlign: 'left' }}><th style={{ padding: 10 }}>Email</th><th>Name</th><th>Role</th><th>Active</th><th>Last login</th><th>Actions</th></tr></thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} style={{ borderTop: '1px solid rgba(255,255,255,.08)' }}>
                <td style={{ padding: 10 }}>{u.email}{u.id === me.id ? ' (you)' : ''}</td>
                <td>{u.name}</td>
                <td>
                  <select value={u.role} onChange={(e) => update(u.id, { role: e.target.value })}>{ROLES.map((r) => <option key={r}>{r}</option>)}</select>
                </td>
                <td>
                  <input type="checkbox" checked={u.is_active} onChange={(e) => update(u.id, { is_active: e.target.checked })} style={{ width: 'auto' }} />
                </td>
                <td className="muted">{u.last_login_at ? new Date(u.last_login_at).toLocaleString() : '—'}</td>
                <td style={{ display: 'flex', gap: 6, padding: 10 }}>
                  <button className="btn secondary" onClick={() => resetPw(u.id)}>Reset PW</button>
                  {u.id !== me.id && <button className="btn secondary" onClick={() => del(u.id)}>Delete</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
