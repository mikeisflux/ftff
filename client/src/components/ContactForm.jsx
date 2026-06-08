import { useState } from 'react';
import { api } from '../lib/api.js';

// Reusable form that posts to a public endpoint (§7.2). Fields are configurable
// so contact / media / exhibitor / suggest-a-guest all reuse it. Honest result
// states — success only shows after the server confirms.
export default function ContactForm({
  endpoint,
  intro,
  showCompany = false,
  subjectDefault,
  buttonLabel = 'Send',
  successMessage = 'Thanks — your message has been sent. We’ll be in touch.',
}) {
  const [form, setForm] = useState({ name: '', email: '', company: '', subject: subjectDefault || '', message: '' });
  const [status, setStatus] = useState('idle'); // idle | sending | sent | error
  const [error, setError] = useState('');

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit(e) {
    e.preventDefault();
    setStatus('sending');
    setError('');
    try {
      const body = {
        name: form.name,
        email: form.email,
        message: form.message,
        ...(form.subject ? { subject: form.subject } : {}),
        ...(showCompany && form.company ? { company: form.company } : {}),
      };
      await api(endpoint, { method: 'POST', body });
      setStatus('sent');
    } catch (err) {
      setStatus('error');
      setError(err.data?.details?.[0]?.message || err.message || 'Something went wrong.');
    }
  }

  if (status === 'sent') {
    return (
      <div className="card" role="status">
        <p style={{ color: 'var(--color-success)' }}>✓ {successMessage}</p>
      </div>
    );
  }

  return (
    <form className="card" onSubmit={submit}>
      {intro && <p className="muted">{intro}</p>}
      <label>Name</label>
      <input value={form.name} onChange={set('name')} required maxLength={200} />
      <label>Email</label>
      <input type="email" value={form.email} onChange={set('email')} required />
      {showCompany && (
        <>
          <label>Company / Organization</label>
          <input value={form.company} onChange={set('company')} maxLength={200} />
        </>
      )}
      {!subjectDefault && (
        <>
          <label>Subject</label>
          <input value={form.subject} onChange={set('subject')} maxLength={300} />
        </>
      )}
      <label>Message</label>
      <textarea rows={6} value={form.message} onChange={set('message')} required maxLength={8000} />
      {status === 'error' && <p style={{ color: 'var(--color-danger)' }}>{error}</p>}
      <div style={{ marginTop: 16 }}>
        <button className="btn" disabled={status === 'sending'}>
          {status === 'sending' ? 'Sending…' : buttonLabel}
        </button>
      </div>
    </form>
  );
}
