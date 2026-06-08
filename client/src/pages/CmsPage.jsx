import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api.js';

// Renders a block-based CMS page (§13.1). For Phase 1 we render a minimal block
// set; the full block library + page builder come in a later phase.
function Block({ block }) {
  const d = block.data || {};
  switch (block.type) {
    case 'heading':
      return <h2 className="glow">{d.text}</h2>;
    case 'richtext':
      // body_html is server-sanitized; safe to render.
      return <div dangerouslySetInnerHTML={{ __html: d.html || '' }} />;
    case 'image':
      return d.url ? <img src={d.url} alt={d.alt || ''} style={{ maxWidth: '100%' }} /> : null;
    default:
      return null;
  }
}

export default function CmsPage() {
  const { slug } = useParams();
  const { data, isLoading, error } = useQuery({
    queryKey: ['page', slug],
    queryFn: () => api(`/pages/${slug}`),
    retry: false,
  });

  if (isLoading) return <div className="section container">Loading…</div>;
  if (error) {
    return (
      <div className="section container">
        <h1>Page coming soon</h1>
        <p className="muted">This page hasn’t been published yet.</p>
      </div>
    );
  }

  const page = data.page;
  return (
    <div className="section container">
      <h1 className="glow">{page.title}</h1>
      {Array.isArray(page.blocks) && page.blocks.map((b, i) => <Block key={i} block={b} />)}
    </div>
  );
}
