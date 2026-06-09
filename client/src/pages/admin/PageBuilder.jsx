import { useEffect, useState, useCallback } from 'react';
import { api } from '../../lib/api.js';
import Reorderable from '../../components/Reorderable.jsx';

const BLOCK_TYPES = [
  ['heading', 'Heading'], ['richtext', 'Rich text'], ['image', 'Image'], ['button', 'Button'],
  ['columns', 'Columns'], ['divider', 'Divider'], ['spacer', 'Spacer'], ['embed', 'Embed'],
  ['map', 'Map'], ['countdown', 'Countdown'], ['guest_carousel', 'Guest carousel'],
  ['ticket_cards', 'Ticket cards'], ['html', 'Raw HTML'],
];

function BlockEditor({ block, onChange }) {
  const d = block.data || {};
  const set = (k, v) => onChange({ ...block, data: { ...d, [k]: v } });
  switch (block.type) {
    case 'heading': return <input value={d.text || ''} onChange={(e) => set('text', e.target.value)} placeholder="Heading text" />;
    case 'richtext': case 'html': return <textarea rows={4} value={d.html || ''} onChange={(e) => set('html', e.target.value)} placeholder="HTML content" />;
    case 'image': return (<><input value={d.url || ''} onChange={(e) => set('url', e.target.value)} placeholder="Image URL" /><input value={d.alt || ''} onChange={(e) => set('alt', e.target.value)} placeholder="Alt text" /></>);
    case 'button': return (<><input value={d.label || ''} onChange={(e) => set('label', e.target.value)} placeholder="Label" /><input value={d.url || ''} onChange={(e) => set('url', e.target.value)} placeholder="URL" /></>);
    case 'spacer': return <input type="number" value={d.height || 24} onChange={(e) => set('height', Number(e.target.value))} placeholder="Height px" />;
    case 'embed': return <input value={d.url || ''} onChange={(e) => set('url', e.target.value)} placeholder="https:// embed URL" />;
    case 'map': return <input value={d.address || ''} onChange={(e) => set('address', e.target.value)} placeholder="Address" />;
    case 'countdown': return <input type="date" value={d.to || ''} onChange={(e) => set('to', e.target.value)} />;
    case 'columns': return <textarea rows={3} value={(d.columns || []).map((c) => c.html).join('\n---\n')} onChange={(e) => set('columns', e.target.value.split('\n---\n').map((html) => ({ html })))} placeholder="Column HTML separated by --- on its own line" />;
    default: return <span className="muted">Dynamic block — renders live data on the page.</span>;
  }
}

// Block-based Page Builder (§13.1): edit any CMS page's blocks, autosave draft,
// publish (server renders + caches HTML + snapshots a version), restore versions.
export default function PageBuilder() {
  const [pages, setPages] = useState([]);
  const [page, setPage] = useState(null);
  const [blocks, setBlocks] = useState([]);
  const [versions, setVersions] = useState([]);
  const [msg, setMsg] = useState('');
  const [newSlug, setNewSlug] = useState('');

  const loadPages = useCallback(async () => setPages((await api('/admin/pages')).pages), []);
  useEffect(() => { loadPages(); }, [loadPages]);

  async function openPage(id) {
    const { page } = await api(`/admin/pages/${id}`);
    setPage(page); setBlocks(Array.isArray(page.blocks) ? page.blocks : []);
    setVersions((await api(`/admin/pages/${id}/versions`)).versions);
    setMsg('');
  }
  async function createPage(e) {
    e.preventDefault();
    try { const { page } = await api('/admin/pages', { method: 'POST', body: { slug: newSlug, title: newSlug } }); setNewSlug(''); await loadPages(); openPage(page.id); }
    catch (err) { setMsg(err.data?.error || err.message); }
  }
  function addBlock(type) { setBlocks((b) => [...b, { type, data: {} }]); }
  function updateBlock(i, nb) { setBlocks((b) => b.map((x, j) => (j === i ? nb : x))); }
  function removeBlock(i) { setBlocks((b) => b.filter((_, j) => j !== i)); }
  function dupBlock(i) { setBlocks((b) => [...b.slice(0, i + 1), JSON.parse(JSON.stringify(b[i])), ...b.slice(i + 1)]); }

  async function saveDraft() { await api(`/admin/pages/${page.id}`, { method: 'PUT', body: { title: page.title, blocks } }); setMsg('Draft saved.'); }
  async function publish() { await saveDraft(); const { page: p } = await api(`/admin/pages/${page.id}/publish`, { method: 'POST' }); setPage(p); setVersions((await api(`/admin/pages/${page.id}/versions`)).versions); setMsg('Published ✓'); await loadPages(); }
  async function restore(vid) { const { page: p } = await api(`/admin/pages/${page.id}/restore/${vid}`, { method: 'POST' }); setBlocks(p.blocks); setMsg('Version restored (save/publish to apply).'); }

  // Reorder uses index ids; map blocks to {id:index} for the helper.
  const idItems = blocks.map((b, i) => ({ id: String(i), b, i }));

  return (
    <div className="mail-grid" style={{ gridTemplateColumns: '240px 1fr' }}>
      <div>
        <h2 className="glow">Pages</h2>
        <form onSubmit={createPage} style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
          <input value={newSlug} onChange={(e) => setNewSlug(e.target.value)} placeholder="new-slug" />
          <button className="btn secondary">+</button>
        </form>
        {pages.map((p) => (
          <button key={p.id} onClick={() => openPage(p.id)} className={page?.id === p.id ? 'admin-link active' : 'admin-link'} style={{ width: '100%', textAlign: 'left', border: 'none', background: 'none', cursor: 'pointer' }}>
            {p.title} {p.is_published ? '' : '·draft'}
          </button>
        ))}
      </div>

      <div>
        {!page ? <p className="muted">Select or create a page.</p> : (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
              <input value={page.title} onChange={(e) => setPage((p) => ({ ...p, title: e.target.value }))} style={{ maxWidth: 320, fontSize: '1.2rem' }} />
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn secondary" onClick={saveDraft}>Save draft</button>
                <button className="btn" onClick={publish}>Publish</button>
                <a className="btn secondary" href={`/${page.slug}`} target="_blank" rel="noreferrer">Preview</a>
              </div>
            </div>
            {msg && <p className="muted">{msg}</p>}

            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: '12px 0' }}>
              {BLOCK_TYPES.map(([t, label]) => <button key={t} className="btn secondary" onClick={() => addBlock(t)}>+ {label}</button>)}
            </div>

            <Reorderable items={idItems} onReorder={(ids) => setBlocks(ids.map((id) => blocks[Number(id)]))} render={({ b, i }) => (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                  <strong>{b.type}</strong>
                  <span style={{ display: 'flex', gap: 6 }}>
                    <button className="btn secondary" onClick={() => dupBlock(i)}>Duplicate</button>
                    <button className="btn secondary" onClick={() => removeBlock(i)}>Delete</button>
                  </span>
                </div>
                <BlockEditor block={b} onChange={(nb) => updateBlock(i, nb)} />
              </div>
            )} />

            {versions.length > 0 && (
              <div className="card" style={{ marginTop: 16 }}>
                <h3>Version history</h3>
                {versions.map((v) => (
                  <div key={v.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}>
                    <span className="muted">{new Date(v.created_at).toLocaleString()} · {v.by || 'system'}</span>
                    <button className="btn secondary" onClick={() => restore(v.id)}>Restore</button>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
