import { useEffect, useState, useCallback } from 'react';
import { api, uploadFile } from '../../lib/api.js';

const money = (cents) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format((cents || 0) / 100);
const toCents = (d) => Math.round(Number(d || 0) * 100);
const toDollars = (c) => (Number(c || 0) / 100).toFixed(2);
const blankProduct = { slug: '', title: '', description: '', price: '25.00', quantity: '100', fulfillment: 'physical', images: [], is_active: true };

// Admin product manager (§10): product CRUD + per-product variants/inventory.
// Reused per storefront section (Shop, Special Experiences, Autographs, etc.).
export default function Products({ section = 'shop', title = 'Shop' }) {
  const [products, setProducts] = useState([]);
  const [form, setForm] = useState(blankProduct);
  const [editingId, setEditingId] = useState(null);
  const [msg, setMsg] = useState('');

  const load = useCallback(async () => {
    const { products } = await api(`/admin/products?section=${encodeURIComponent(section)}`);
    setProducts(products);
  }, [section]);
  useEffect(() => { load(); setForm(blankProduct); setEditingId(null); }, [load]);

  async function saveProduct(e) {
    e.preventDefault();
    setMsg('');
    const body = {
      slug: form.slug, section, title: form.title, description: form.description || null,
      price_cents: toCents(form.price), is_active: form.is_active,
      fulfillment: form.fulfillment,
      images: form.images || [],
    };
    try {
      if (editingId) {
        await api(`/admin/products/${editingId}`, { method: 'PUT', body });
      } else {
        const { product } = await api('/admin/products', { method: 'POST', body });
        // Auto-create a single-item stock entry so a simple product is sellable
        // immediately — no need to add a variant by hand. Skipped when blank/0
        // (e.g. a product that will use size/color options instead).
        const qty = Math.trunc(Number(form.quantity));
        if (product?.id && Number.isFinite(qty) && qty > 0) {
          await api(`/admin/products/${product.id}/variants`, {
            method: 'POST', body: { options: {}, price_cents: null, inventory: qty },
          });
        }
      }
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
      <h1 className="glow">{title}</h1>
      {msg && <p style={{ color: 'var(--color-danger)' }}>{msg}</p>}

      <form className="card" onSubmit={saveProduct} style={{ marginBottom: 20 }}>
        <h3>{editingId ? 'Edit product' : 'Add product'}</h3>
        <div className="grid cols-3">
          <div><label>Slug</label><input value={form.slug} onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value }))} required /></div>
          <div><label>Title</label><input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} required /></div>
          <div><label>Price ($)</label><input type="number" step="0.01" min="0" value={form.price} onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))} /></div>
        </div>
        {!editingId && (
          <div style={{ maxWidth: 260 }}>
            <label>Initial stock quantity</label>
            <input type="number" min="0" step="1" value={form.quantity} onChange={(e) => setForm((f) => ({ ...f, quantity: e.target.value }))} />
            <div className="muted" style={{ fontSize: '.8rem', marginTop: 4 }}>
              Sells it as a single item — no variant needed. Clear this if the product will have size/color options (add those after saving).
            </div>
          </div>
        )}
        <div style={{ maxWidth: 320, marginTop: 10 }}>
          <label>Product type</label>
          <select value={form.fulfillment} onChange={(e) => setForm((f) => ({ ...f, fulfillment: e.target.value }))}>
            <option value="physical">Physical (pickup or ship)</option>
            <option value="digital">Digital (no shipping)</option>
          </select>
          <div className="muted" style={{ fontSize: '.8rem', marginTop: 4 }}>
            Physical items can be picked up free at the show or shipped for a flat fee (set in Admin → Shipping). Digital items never ship.
          </div>
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
            <h3 style={{ margin: 0 }}>{p.title} <span className="muted" style={{ fontSize: '.8rem' }}>/{p.slug} · {money(p.price_cents)} · {p.fulfillment === 'digital' ? 'digital' : 'physical'}{!p.is_active ? ' · inactive' : ''}</span></h3>
            <div style={{ display: 'flex', gap: 6 }}>
              <button className="btn secondary" onClick={() => { setEditingId(p.id); setForm({ slug: p.slug, title: p.title, description: p.description || '', price: toDollars(p.price_cents), fulfillment: p.fulfillment || 'physical', images: p.images || [], is_active: p.is_active }); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>Edit</button>
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
  const variants = product.variants || [];
  const hasOptions = variants.some((v) => Object.keys(v.options || {}).length > 0);
  const isSingle = variants.length > 0 && !hasOptions;

  const [opt, setOpt] = useState({ name: 'Size', value: '', price: '', inventory: 100 });
  const [singleQty, setSingleQty] = useState(100);

  // Persist an inline edit, carrying over the variant's other fields unchanged.
  const saveField = (v, patch) => onSave(v.id, {
    sku: v.sku, options: v.options, price_cents: v.price_cents,
    inventory: v.inventory, is_active: v.is_active, ...patch,
  });

  const addSingle = () => onAdd(product.id, { options: {}, price_cents: null, inventory: Number(singleQty) || 0 });
  const addOption = () => {
    if (!opt.name.trim() || !opt.value.trim()) return;
    onAdd(product.id, {
      options: { [opt.name.trim()]: opt.value.trim() },
      price_cents: opt.price === '' ? null : toCents(opt.price),
      inventory: Number(opt.inventory) || 0,
    });
    setOpt((s) => ({ ...s, value: '', price: '' }));
  };

  return (
    <div style={{ marginTop: 14, borderTop: '1px solid rgba(255,255,255,.08)', paddingTop: 12 }}>
      <div style={{ fontWeight: 600 }}>Stock &amp; options</div>
      <p className="muted" style={{ marginTop: 2, fontSize: '.85rem', maxWidth: 640 }}>
        {isSingle
          ? 'Sold as a single item — just keep its stock count up to date below.'
          : 'A product needs at least one stock entry before it can be bought. Sell it as a single item, or add the choices customers pick from (e.g. Size → Small / Medium / Large), each with its own stock and optional price.'}
      </p>

      {variants.length === 0 && (
        <div style={{ border: '1px solid var(--color-danger)', background: 'rgba(255,80,80,.08)', color: 'var(--color-danger)', padding: '8px 12px', borderRadius: 8, margin: '10px 0', fontSize: '.88rem' }}>
          ⚠ Not for sale yet — add stock below before customers can buy it.
        </div>
      )}

      {variants.length > 0 && (
        <table style={{ width: '100%', borderCollapse: 'collapse', margin: '10px 0' }}>
          <thead>
            <tr className="muted" style={{ textAlign: 'left', fontSize: '.78rem' }}>
              <th style={{ padding: '4px 8px 4px 0' }}>{isSingle ? 'Item' : 'Customer chooses'}</th>
              <th style={{ padding: '4px 8px' }}>Price</th>
              <th style={{ padding: '4px 8px' }}>In stock</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {variants.map((v) => {
              const label = Object.entries(v.options || {}).map(([k, val]) => `${k}: ${val}`).join(', ');
              return (
                <tr key={v.id} style={{ borderTop: '1px solid rgba(255,255,255,.08)' }}>
                  <td style={{ padding: '6px 8px 6px 0' }}>{label || 'Single item'}</td>
                  <td style={{ padding: '6px 8px', whiteSpace: 'nowrap' }}>
                    <span className="muted" style={{ marginRight: 4 }}>$</span>
                    <input
                      type="number" step="0.01" min="0" style={{ width: 90 }}
                      defaultValue={v.price_cents != null ? toDollars(v.price_cents) : ''}
                      placeholder={toDollars(product.price_cents)}
                      title="Leave blank to use the product's base price"
                      onBlur={(e) => {
                        const cents = e.target.value === '' ? null : toCents(e.target.value);
                        if (cents !== v.price_cents) saveField(v, { price_cents: cents });
                      }}
                    />
                  </td>
                  <td style={{ padding: '6px 8px' }}>
                    <input
                      type="number" min="0" defaultValue={v.inventory} style={{ width: 80 }}
                      onBlur={(e) => Number(e.target.value) !== v.inventory && saveField(v, { inventory: Number(e.target.value) })}
                    />
                  </td>
                  <td style={{ padding: '6px 0' }}>
                    <button className="btn secondary" title="Remove" onClick={() => onDelete(v.id)}>✕</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {/* Add a choice (size/color/tier). Hidden once it's a single item. */}
      {!isSingle && (
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div><label>Option name</label><input value={opt.name} onChange={(e) => setOpt((s) => ({ ...s, name: e.target.value }))} placeholder="Size" style={{ width: 120 }} /></div>
          <div><label>Choice</label><input value={opt.value} onChange={(e) => setOpt((s) => ({ ...s, value: e.target.value }))} placeholder="Large" style={{ width: 120 }} /></div>
          <div><label>Price (optional)</label><input type="number" step="0.01" min="0" value={opt.price} onChange={(e) => setOpt((s) => ({ ...s, price: e.target.value }))} placeholder={`${toDollars(product.price_cents)} (base)`} style={{ width: 130 }} /></div>
          <div><label>In stock</label><input type="number" min="0" value={opt.inventory} onChange={(e) => setOpt((s) => ({ ...s, inventory: e.target.value }))} style={{ width: 90 }} /></div>
          <button className="btn" onClick={addOption} disabled={!opt.name.trim() || !opt.value.trim()}>Add choice</button>
        </div>
      )}

      {/* Simple path: sell as a single item. Only when nothing exists yet. */}
      {variants.length === 0 && (
        <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px dashed rgba(255,255,255,.14)', display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div className="muted" style={{ fontSize: '.85rem', width: '100%' }}>No choices to pick? Just sell it as one item:</div>
          <div><label>In stock</label><input type="number" min="0" value={singleQty} onChange={(e) => setSingleQty(e.target.value)} style={{ width: 90 }} /></div>
          <button className="btn secondary" onClick={addSingle}>Sell as single item</button>
        </div>
      )}
    </div>
  );
}
