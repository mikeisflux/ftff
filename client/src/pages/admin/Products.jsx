import { useEffect, useState, useCallback } from 'react';
import { api, uploadFile } from '../../lib/api.js';

const money = (cents) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format((cents || 0) / 100);
const toCents = (d) => Math.round(Number(d || 0) * 100);
const toDollars = (c) => (Number(c || 0) / 100).toFixed(2);
const blankProduct = { slug: '', title: '', description: '', price: '25.00', images: [], is_active: true };

// Admin store manager (§10): product CRUD + per-product variants/inventory.
export default function Products() {
  const [products, setProducts] = useState([]);
  const [form, setForm] = useState(blankProduct);
  const [editingId, setEditingId] = useState(null);
  const [msg, setMsg] = useState('');

  const load = useCallback(async () => {
    const { products } = await api('/admin/products');
    setProducts(products);
  }, []);
  useEffect(() => { load(); }, [load]);

  async function saveProduct(e) {
    e.preventDefault();
    setMsg('');
    const body = {
      slug: form.slug, title: form.title, description: form.description || null,
      price_cents: toCents(form.price), is_active: form.is_active,
      images: form.images || [],
    };
    try {
      if (editingId) await api(`/admin/products/${editingId}`, { method: 'PUT', body });
      else await api('/admin/products', { method: 'POST', body });
      setForm(blankProduct); setEditingId(null); await load();
    } catch (err) { setMsg(err.data?.details?.[0]?.message || err.message); }
  }

  async function onUploadImage(file) {
    setMsg('');
    try {
      const { url } = await uploadFile('/admin/uploads', file);
      setForm((f) => ({ ...f, images: [...(f.images || []), url] }));
    } catch (err) { setMsg(err.message); }
  }
  const removeImage = (url) => setForm((f) => ({ ...f, images: f.images.filter((u) => u !== url) }));

  async function delProduct(id) {
    await api(`/admin/products/${id}`, { method: 'DELETE' }).catch((e) => setMsg(e.message));
    await load();
  }

  async function addVariant(productId, v) {
    await api(`/admin/products/${productId}/variants`, { method: 'POST', body: v }).catch((e) => setMsg(e.message));
    await load();
  }
  async function saveVariant(vid, v) {
    await api(`/admin/products/variants/${vid}`, { method: 'PUT', body: v }).catch((e) => setMsg(e.message));
    await load();
  }
  async function delVariant(vid) {
    await api(`/admin/products/variants/${vid}`, { method: 'DELETE' }).catch((e) => setMsg(e.message));
    await load();
  }

  return (
    <div>
      <h1 className="glow">Products</h1>
      {msg && <p style={{ color: 'var(--color-danger)' }}>{msg}</p>}

      <form className="card" onSubmit={saveProduct} style={{ marginBottom: 20 }}>
        <h3>{editingId ? 'Edit product' : 'Add product'}</h3>
        <div className="grid cols-3">
          <div><label>Slug</label><input value={form.slug} onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value }))} required /></div>
          <div><label>Title</label><input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} required /></div>
          <div><label>Price ($)</label><input type="number" step="0.01" min="0" value={form.price} onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))} /></div>
        </div>
        <label>Description</label>
        <textarea rows={2} value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
        <label>Images</label>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          {(form.images || []).map((url) => (
            <div key={url} style={{ position: 'relative' }}>
              <img src={url} alt="" style={{ height: 64, width: 64, objectFit: 'cover', borderRadius: 8 }} />
              <button type="button" onClick={() => removeImage(url)} title="Remove"
                style={{ position: 'absolute', top: -8, right: -8, background: 'var(--color-danger)', color: '#fff', border: 'none', borderRadius: '50%', width: 20, height: 20, cursor: 'pointer', lineHeight: 1 }}>×</button>
            </div>
          ))}
          <label className="btn secondary" style={{ cursor: 'pointer' }}>
            + Upload image
            <input type="file" accept="image/*" style={{ display: 'none' }}
              onChange={(e) => { if (e.target.files[0]) onUploadImage(e.target.files[0]); e.target.value = ''; }} />
          </label>
        </div>
        <label style={{ display: 'inline-flex', gap: 8, alignItems: 'center', marginTop: 10 }}>
          <input type="checkbox" style={{ width: 'auto' }} checked={form.is_active} onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))} /> Active
        </label>
        <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
          <button className="btn">{editingId ? 'Save' : 'Add product'}</button>
          {editingId && <button type="button" className="btn secondary" onClick={() => { setEditingId(null); setForm(blankProduct); }}>Cancel</button>}
        </div>
      </form>

      {products.map((p) => (
        <div className="card" key={p.id} style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <h3 style={{ margin: 0 }}>{p.title} <span className="muted" style={{ fontSize: '.8rem' }}>/{p.slug} · {money(p.price_cents)}{!p.is_active ? ' · inactive' : ''}</span></h3>
            <div style={{ display: 'flex', gap: 6 }}>
              <button className="btn secondary" onClick={() => { setEditingId(p.id); setForm({ slug: p.slug, title: p.title, description: p.description || '', price: toDollars(p.price_cents), images: p.images || [], is_active: p.is_active }); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>Edit</button>
              <button className="btn secondary" onClick={() => delProduct(p.id)}>Delete</button>
            </div>
          </div>
          <Variants product={p} onAdd={addVariant} onSave={saveVariant} onDelete={delVariant} />
        </div>
      ))}
    </div>
  );
}

function Variants({ product, onAdd, onSave, onDelete }) {
  const [nv, setNv] = useState({ optionKey: 'size', optionVal: '', inventory: 0, price_cents: '' });
  return (
    <div style={{ marginTop: 10 }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead><tr style={{ textAlign: 'left' }}><th>Options</th><th>SKU</th><th>Price</th><th>Inventory</th><th /></tr></thead>
        <tbody>
          {(product.variants || []).map((v) => (
            <tr key={v.id} style={{ borderTop: '1px solid rgba(255,255,255,.08)' }}>
              <td>{Object.entries(v.options || {}).map(([k, val]) => `${k}: ${val}`).join(', ') || '—'}</td>
              <td className="muted">{v.sku}</td>
              <td>{v.price_cents != null ? money(v.price_cents) : 'inherit'}</td>
              <td>
                <input type="number" defaultValue={v.inventory} style={{ width: 80 }}
                  onBlur={(e) => Number(e.target.value) !== v.inventory && onSave(v.id, { sku: v.sku, options: v.options, price_cents: v.price_cents, inventory: Number(e.target.value), is_active: v.is_active })} />
              </td>
              <td><button className="btn secondary" onClick={() => onDelete(v.id)}>✕</button></td>
            </tr>
          ))}
        </tbody>
      </table>
      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', marginTop: 8, flexWrap: 'wrap' }}>
        <div><label>Option key</label><input value={nv.optionKey} onChange={(e) => setNv((s) => ({ ...s, optionKey: e.target.value }))} style={{ width: 110 }} /></div>
        <div><label>Value</label><input value={nv.optionVal} onChange={(e) => setNv((s) => ({ ...s, optionVal: e.target.value }))} style={{ width: 110 }} /></div>
        <div><label>Inventory</label><input type="number" value={nv.inventory} onChange={(e) => setNv((s) => ({ ...s, inventory: e.target.value }))} style={{ width: 90 }} /></div>
        <button className="btn secondary" onClick={() => onAdd(product.id, {
          options: nv.optionVal ? { [nv.optionKey]: nv.optionVal } : {},
          inventory: Number(nv.inventory) || 0,
        })}>Add variant</button>
      </div>
    </div>
  );
}
