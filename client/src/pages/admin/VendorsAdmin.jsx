import { useEffect, useState, useCallback } from 'react';
import { api } from '../../lib/api.js';

const blank = { name: '', booth_number: '', category: '', website: '', is_active: true };

// Vendor directory manager — full CRUD for the public /vendors page. Approved
// exhibitor applications also create entries here automatically.
export default function VendorsAdmin() {
  const [vendors, setVendors] = useState([]);
  const [form, setForm] = useState(blank);
  const [editingId, setEditingId] = useState(null);
  const [filter, setFilter] = useState('');
  const [msg, setMsg] = useState('');

  const load = useCallback(async () => setVendors((await api('/admin/vendors')).vendors), []);
  useEffect(() => { load(); }, [load]);

  async function save(e) {
    e.preventDefault();
    setMsg('');
    try {
      const body = {
        name: form.name,
        booth_number: form.booth_number || null,
        category: form.category || null,
        website: form.website || null,
        is_active: form.is_active,
      };
      if (editingId) await api(`/admin/vendors/${editingId}`, { method: 'PUT', body });
      else await api('/admin/vendors', { method: 'POST', body });
      setForm(blank); setEditingId(null); await load();
    } catch (err) { setMsg(err.message); }
  }
  function edit(v) {
    setEditingId(v.id);
    setForm({ name: v.name, booth_number: v.booth_number || '', category: v.category || '', website: v.website || '', is_active: v.is_active });
  }
  async function del(id) { if (window.confirm('Delete vendor?')) { await api(`/admin/vendors/${id}`, { method: 'DELETE' }); await load(); } }

  const shown = filter
    ? vendors.filter((v) => v.name.toLowerCase().includes(filter.toLowerCase()))
    : vendors;

  return (
    <div>
      <h1 className="glow">Vendors</h1>
      <p className="muted">Confirmed exhibitors shown on the public Vendors page ({vendors.length}).</p>
      {msg && <p style={{ color: 'var(--color-danger)' }}>{msg}</p>}

      <form className="card" onSubmit={save} style={{ marginBottom: 16 }}>
        <h3>{editingId ? 'Edit vendor' : 'Add vendor'}</h3>
        <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div><label>Name</label><input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} required /></div>
          <div><label>Booth number</label><input value={form.booth_number} onChange={(e) => setForm((f) => ({ ...f, booth_number: e.target.value }))} placeholder="e.g. A1" /></div>
          <div><label>Category</label><input value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))} /></div>
          <div><label>Website</label><input value={form.website} onChange={(e) => setForm((f) => ({ ...f, website: e.target.value }))} placeholder="https://…" /></div>
        </div>
        <label style={{ display: 'inline-flex', gap: 8, alignItems: 'center', marginTop: 10 }}>
          <input type="checkbox" style={{ width: 'auto' }} checked={form.is_active} onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))} /> Active (visible on the site)
        </label>
        <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
          <button className="btn">{editingId ? 'Save' : 'Add vendor'}</button>
          {editingId && <button type="button" className="btn secondary" onClick={() => { setEditingId(null); setForm(blank); }}>Cancel</button>}
        </div>
      </form>

      <input placeholder="Filter…" value={filter} onChange={(e) => setFilter(e.target.value)} style={{ width: 260, marginBottom: 8 }} />
      <table className="admin-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead><tr><th style={{ textAlign: 'left' }}>Name</th><th style={{ textAlign: 'left' }}>Booth</th><th style={{ textAlign: 'left' }}>Category</th><th></th></tr></thead>
        <tbody>
          {shown.map((v) => (
            <tr key={v.id} style={{ borderTop: '1px solid rgba(255,255,255,.08)' }}>
              <td>{v.name}{!v.is_active && <span className="muted"> · hidden</span>}</td>
              <td>{v.booth_number || '—'}</td>
              <td className="muted">{v.category || '—'}</td>
              <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                <button className="btn secondary" onClick={() => edit(v)}>Edit</button>{' '}
                <button className="btn secondary" onClick={() => del(v.id)}>✕</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
