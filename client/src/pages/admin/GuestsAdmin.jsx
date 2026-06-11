import { useEffect, useState, useCallback } from 'react';
import { api, uploadFile } from '../../lib/api.js';
import Reorderable from '../../components/Reorderable.jsx';

const CATEGORIES = ['celebrities', 'comic_creators', 'cosplayers', 'other'];
const TIERS = [['featured', 'Featured Guests'], ['special', 'Special Guests'], ['also_appearing', 'Also Appearing']];
const DAYS = ['Friday', 'Saturday', 'Sunday'];
const blank = {
  name: '', known_for: '', bio: '', bio_url: '', headshot_url: '', category: 'celebrities', tier: 'featured',
  is_featured: false, is_active: true, appearance_days: [],
  autograph: '', autograph_premium: '', photo_op: '',
  imdb: '', website: '', twitter: '', instagram: '',
};

const centsToDollars = (c) => (c == null ? '' : String(c / 100));
const dollarsToCents = (v) => {
  if (v == null || String(v).trim() === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n * 100) : null;
};

// Shape a server guest into the editable form (also used by the inline Feature
// toggle so it never drops the detail-page fields).
function formFromGuest(g) {
  return {
    name: g.name, known_for: g.known_for || '', bio: g.bio || '', bio_url: g.bio_url || '',
    headshot_url: g.headshot_url || '', category: g.category, tier: g.tier || 'featured',
    is_featured: g.is_featured, is_active: g.is_active,
    appearance_days: Array.isArray(g.appearance_days) ? g.appearance_days : [],
    autograph: centsToDollars(g.autograph_cents),
    autograph_premium: centsToDollars(g.autograph_premium_cents),
    photo_op: centsToDollars(g.photo_op_cents),
    imdb: g.socials?.imdb || '', website: g.socials?.website || '',
    twitter: g.socials?.twitter || g.socials?.x || '', instagram: g.socials?.instagram || '',
  };
}

function bodyFromForm(f) {
  const socials = {};
  for (const k of ['imdb', 'website', 'twitter', 'instagram']) if (f[k]) socials[k] = f[k];
  return {
    name: f.name,
    known_for: f.known_for || null,
    bio: f.bio || null,
    bio_url: f.bio_url || null,
    headshot_url: f.headshot_url || null,
    category: f.category,
    tier: f.tier,
    is_featured: f.is_featured,
    is_active: f.is_active,
    appearance_days: f.appearance_days,
    socials,
    autograph_cents: dollarsToCents(f.autograph),
    autograph_premium_cents: dollarsToCents(f.autograph_premium),
    photo_op_cents: dollarsToCents(f.photo_op),
  };
}

// Guest Tile Manager (§13.2): upload a photo + write a bio -> it appears as a
// tile that links to the guest's own detail page. Pricing/socials/appearance
// days drive that page; pricing is optional (left blank => no PRICING block).
export default function GuestsAdmin() {
  const [guests, setGuests] = useState([]);
  const [form, setForm] = useState(blank);
  const [editingId, setEditingId] = useState(null);
  const [filter, setFilter] = useState('');
  const [msg, setMsg] = useState('');

  const load = useCallback(async () => setGuests((await api('/admin/guests')).guests), []);
  useEffect(() => { load(); }, [load]);

  const featuredCount = guests.filter((g) => g.is_featured).length;

  async function save(e) {
    e.preventDefault();
    setMsg('');
    try {
      const body = bodyFromForm(form);
      if (editingId) await api(`/admin/guests/${editingId}`, { method: 'PUT', body });
      else await api('/admin/guests', { method: 'POST', body });
      setForm(blank); setEditingId(null); await load();
    } catch (err) { setMsg(err.message); }
  }
  async function onUpload(file) {
    try { const { url } = await uploadFile('/admin/uploads', file); setForm((f) => ({ ...f, headshot_url: url })); }
    catch (err) { setMsg(err.message); }
  }
  function toggleDay(d) {
    setForm((f) => ({
      ...f,
      appearance_days: f.appearance_days.includes(d)
        ? f.appearance_days.filter((x) => x !== d)
        : [...f.appearance_days, d],
    }));
  }
  function editGuest(g) { setEditingId(g.id); setForm(formFromGuest(g)); }
  async function toggleFeatured(g) {
    try {
      await api(`/admin/guests/${g.id}`, { method: 'PUT', body: { ...bodyFromForm(formFromGuest(g)), is_featured: !g.is_featured } });
      await load();
    } catch (err) { setMsg(err.message); }
  }
  async function del(id) { if (window.confirm('Delete guest?')) { await api(`/admin/guests/${id}`, { method: 'DELETE' }); await load(); } }
  async function reorder(orderedIds) { await api('/admin/guests/reorder', { method: 'POST', body: { orderedIds } }); }

  const shown = filter ? guests.filter((g) => g.category === filter) : guests;

  return (
    <div>
      <h1 className="glow">Guest Tile Manager</h1>
      <p className="muted">Featured on homepage: {featuredCount}/10</p>
      {msg && <p style={{ color: 'var(--color-danger)' }}>{msg}</p>}

      <form className="card" onSubmit={save} style={{ marginBottom: 16 }}>
        <h3>{editingId ? 'Edit guest' : 'Add guest'}</h3>
        <div className="grid" style={{ gridTemplateColumns: '160px 1fr' }}>
          <div>
            {/* Live tile preview */}
            <div className="card" style={{ textAlign: 'center' }}>
              {form.headshot_url ? <img src={form.headshot_url} alt="" style={{ width: '100%', borderRadius: 8 }} /> : <div style={{ aspectRatio: '1', background: 'color-mix(in srgb, var(--color-surface) 80%, transparent)', borderRadius: 8, display: 'grid', placeItems: 'center' }} className="muted">No photo</div>}
              <strong>{form.name || 'Name'}</strong>
              <div className="muted" style={{ fontSize: 12 }}>{form.known_for}</div>
            </div>
            <input type="file" accept="image/*" onChange={(e) => e.target.files[0] && onUpload(e.target.files[0])} style={{ marginTop: 8 }} />
          </div>
          <div>
            <label>Name</label><input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} required />
            <label>Known for</label><input value={form.known_for} onChange={(e) => setForm((f) => ({ ...f, known_for: e.target.value }))} placeholder="e.g. Lethal Weapon, Braveheart, Mad Max" />
            <label>Category</label>
            <select value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}>{CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select>
            <label>Tier (listing group)</label>
            <select value={form.tier} onChange={(e) => setForm((f) => ({ ...f, tier: e.target.value }))}>{TIERS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>

            <label>Appearing on</label>
            <div style={{ display: 'flex', gap: 14, margin: '4px 0 8px' }}>
              {DAYS.map((d) => (
                <label key={d} style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                  <input type="checkbox" style={{ width: 'auto' }} checked={form.appearance_days.includes(d)} onChange={() => toggleDay(d)} /> {d}
                </label>
              ))}
            </div>

            <label>Bio</label><textarea rows={4} value={form.bio} onChange={(e) => setForm((f) => ({ ...f, bio: e.target.value }))} />
            <label>“Check out their bio” link (optional URL)</label>
            <input value={form.bio_url} onChange={(e) => setForm((f) => ({ ...f, bio_url: e.target.value }))} placeholder="https://…" />

            <h4 style={{ margin: '14px 0 4px' }}>Pricing <span className="muted" style={{ fontWeight: 400, fontSize: 12 }}>— leave blank to hide the Pricing block (e.g. comic creators)</span></h4>
            <div className="grid" style={{ gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
              <div><label>Autograph $</label><input type="number" min="0" step="0.01" value={form.autograph} onChange={(e) => setForm((f) => ({ ...f, autograph: e.target.value }))} /></div>
              <div><label>Autograph Premium $</label><input type="number" min="0" step="0.01" value={form.autograph_premium} onChange={(e) => setForm((f) => ({ ...f, autograph_premium: e.target.value }))} /></div>
              <div><label>Photo Op $</label><input type="number" min="0" step="0.01" value={form.photo_op} onChange={(e) => setForm((f) => ({ ...f, photo_op: e.target.value }))} /></div>
            </div>

            <h4 style={{ margin: '14px 0 4px' }}>Links <span className="muted" style={{ fontWeight: 400, fontSize: 12 }}>— shown as buttons in Guest Info</span></h4>
            <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <div><label>IMDb URL</label><input value={form.imdb} onChange={(e) => setForm((f) => ({ ...f, imdb: e.target.value }))} placeholder="https://www.imdb.com/name/…" /></div>
              <div><label>Website URL</label><input value={form.website} onChange={(e) => setForm((f) => ({ ...f, website: e.target.value }))} placeholder="https://…" /></div>
              <div><label>X / Twitter URL</label><input value={form.twitter} onChange={(e) => setForm((f) => ({ ...f, twitter: e.target.value }))} placeholder="https://x.com/…" /></div>
              <div><label>Instagram URL</label><input value={form.instagram} onChange={(e) => setForm((f) => ({ ...f, instagram: e.target.value }))} placeholder="https://instagram.com/…" /></div>
            </div>

            <label style={{ display: 'inline-flex', gap: 8, alignItems: 'center', marginTop: 12 }}>
              <input type="checkbox" style={{ width: 'auto' }} checked={form.is_featured} onChange={(e) => setForm((f) => ({ ...f, is_featured: e.target.checked }))} /> Featured (homepage)
            </label>
          </div>
        </div>
        <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
          <button className="btn">{editingId ? 'Save' : 'Add guest'}</button>
          {editingId && <button type="button" className="btn secondary" onClick={() => { setEditingId(null); setForm(blank); }}>Cancel</button>}
        </div>
      </form>

      <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
        <select value={filter} onChange={(e) => setFilter(e.target.value)} style={{ width: 220 }}>
          <option value="">All categories</option>
          {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      <Reorderable items={shown} onReorder={reorder} render={(g) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {g.headshot_url && <img src={g.headshot_url} alt="" style={{ height: 44, width: 44, objectFit: 'cover', borderRadius: 6 }} />}
          <div style={{ flex: 1 }}><strong>{g.name}</strong> <span className="muted">· {g.category}{!g.is_active ? ' · inactive' : ''}</span></div>
          <button className="btn secondary" onClick={() => toggleFeatured(g)}>{g.is_featured ? '★ Featured' : '☆ Feature'}</button>
          <button className="btn secondary" onClick={() => editGuest(g)}>Edit</button>
          <button className="btn secondary" onClick={() => del(g.id)}>✕</button>
        </div>
      )} />
    </div>
  );
}
