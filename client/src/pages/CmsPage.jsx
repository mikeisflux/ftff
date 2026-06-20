import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api.js';
import HeroCarousel from '../components/HeroCarousel.jsx';

// Renders a block-based CMS page (§13.1). Many nav routes are CMS-managed
// content authored in the admin Page Builder (later phase). Until a page is
// authored, we show an honest, branded "in preparation" state — not a broken
// link or fake content.
function Block({ block }) {
  const d = block.data || {};
  switch (block.type) {
    case 'heading':
      return <h2 className="glow">{d.text}</h2>;
    case 'richtext':
      // body_html / block html is server-sanitized; safe to render.
      return <div dangerouslySetInnerHTML={{ __html: d.html || '' }} />;
    case 'image':
      return d.url ? <img src={d.url} alt={d.alt || ''} style={{ maxWidth: '100%' }} /> : null;
    default:
      return null;
  }
}

function titleFromSlug(slug) {
  return slug
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

export default function CmsPage() {
  const { slug } = useParams();
  const { data, isLoading, error } = useQuery({
    queryKey: ['page', slug],
    queryFn: () => api(`/pages/${slug}`),
    retry: false,
  });
  // A hero slider can be assigned to this page in admin (Hero Slides → Page).
  const slidesQ = useQuery({
    queryKey: ['slides', slug],
    queryFn: () => api(`/slides?page=${encodeURIComponent(slug)}`),
    retry: false,
  });
  const pageSlides = slidesQ.data?.slides ?? [];

  if (isLoading) return <div className="section container"><p className="muted">Loading…</p></div>;

  const hero = pageSlides.length > 0
    ? <HeroCarousel slides={pageSlides} fallbackTitle={error ? titleFromSlug(slug) : data?.page?.title} />
    : null;

  if (error) {
    // Not yet authored — honest empty state with real navigation.
    return (
      <div>
        {hero}
        <div className="section container">
          <h1 className="glow">{titleFromSlug(slug)}</h1>
          <p className="muted">
            This page is being prepared. In the meantime, explore the rest of the show:
          </p>
          <p style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 16 }}>
            <Link className="btn" to="/buy-tickets">Tickets</Link>
            <Link className="btn secondary" to="/all-guests">Guests</Link>
            <Link className="btn secondary" to="/contact-us">Contact Us</Link>
          </p>
        </div>
      </div>
    );
  }

  const page = data.page;
  return (
    <div>
      {hero}
      <div className="section container">
        <h1 className="glow">{page.title}</h1>
        {/* Prefer the server-rendered, sanitized body_html cache (covers the full
            block library); fall back to client block rendering for legacy pages. */}
        {page.body_html
          ? <div className="cms-body" dangerouslySetInnerHTML={{ __html: page.body_html }} />
          : Array.isArray(page.blocks) && page.blocks.map((b, i) => <Block key={i} block={b} />)}
      </div>
    </div>
  );
}
