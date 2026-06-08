import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api.js';

export default function Faqs() {
  const { data } = useQuery({ queryKey: ['faqs'], queryFn: () => api('/faqs') });
  const faqs = data?.faqs ?? [];
  const [open, setOpen] = useState(null);

  return (
    <div className="section container" style={{ maxWidth: 820 }}>
      <h1 className="glow">Frequently Asked Questions</h1>
      {faqs.length === 0 ? (
        <p className="muted">FAQs will be posted soon.</p>
      ) : (
        faqs.map((f) => (
          <div className="card" key={f.id} style={{ marginBottom: 10 }}>
            <button
              onClick={() => setOpen((o) => (o === f.id ? null : f.id))}
              aria-expanded={open === f.id}
              style={{ all: 'unset', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', width: '100%' }}
            >
              <strong>{f.question}</strong>
              <span>{open === f.id ? '−' : '+'}</span>
            </button>
            {open === f.id && <p className="muted" style={{ marginTop: 10 }}>{f.answer}</p>}
          </div>
        ))
      )}
    </div>
  );
}
