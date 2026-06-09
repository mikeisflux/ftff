import { useEffect, useState, useCallback } from 'react';
import { api } from '../../lib/api.js';
import Reorderable from '../../components/Reorderable.jsx';

const blank = { question: '', answer: '', is_active: true };

export default function FaqsAdmin() {
  const [faqs, setFaqs] = useState([]);
  const [form, setForm] = useState(blank);
  const [editingId, setEditingId] = useState(null);

  const load = useCallback(async () => setFaqs((await api('/admin/faqs')).faqs), []);
  useEffect(() => { load(); }, [load]);

  async function save(e) {
    e.preventDefault();
    if (editingId) await api(`/admin/faqs/${editingId}`, { method: 'PUT', body: form });
    else await api('/admin/faqs', { method: 'POST', body: form });
    setForm(blank); setEditingId(null); await load();
  }
  async function del(id) { await api(`/admin/faqs/${id}`, { method: 'DELETE' }); await load(); }
  async function reorder(orderedIds) { await api('/admin/faqs/reorder', { method: 'POST', body: { orderedIds } }); }

  return (
    <div>
      <h1 className="glow">FAQs</h1>
      <form className="card" onSubmit={save} style={{ marginBottom: 16 }}>
        <h3>{editingId ? 'Edit FAQ' : 'Add FAQ'}</h3>
        <label>Question</label><input value={form.question} onChange={(e) => setForm((f) => ({ ...f, question: e.target.value }))} required />
        <label>Answer</label><textarea rows={3} value={form.answer} onChange={(e) => setForm((f) => ({ ...f, answer: e.target.value }))} required />
        <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
          <button className="btn">{editingId ? 'Save' : 'Add'}</button>
          {editingId && <button type="button" className="btn secondary" onClick={() => { setEditingId(null); setForm(blank); }}>Cancel</button>}
        </div>
      </form>
      <h3>FAQs (drag to reorder)</h3>
      <Reorderable items={faqs} onReorder={reorder} render={(f) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <strong style={{ flex: 1 }}>{f.question}</strong>
          <button className="btn secondary" onClick={() => { setEditingId(f.id); setForm({ question: f.question, answer: f.answer, is_active: f.is_active }); }}>Edit</button>
          <button className="btn secondary" onClick={() => del(f.id)}>✕</button>
        </div>
      )} />
    </div>
  );
}
