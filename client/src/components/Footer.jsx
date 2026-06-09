import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api.js';

// Customer Service footer links (§7.2). All targets are real, working routes.
const LINKS = [
  ['Show Hours', '/show-hours'],
  ['Contact Us', '/contact-us'],
  ['Newsletter Sign Up', '/sign-up'],
  ['Media Inquiries', '/media-inquiries'],
  ['Exhibitor Applications', '/become-an-exhibitor'],
  ['FAQs', '/faqs'],
  ['Policies', '/policies'],
  ['Accessibility', '/accessibility'],
];

export default function Footer() {
  const infoQ = useQuery({ queryKey: ['show-info'], queryFn: () => api('/show-info') });
  const brand = infoQ.data?.showInfo?.name ?? 'For The Fans Fest';

  return (
    <footer className="section" style={{ borderTop: '1px solid rgba(255,255,255,.08)', marginTop: 48 }}>
      <div className="container">
        <h3 className="glow">Customer Service</h3>
        <div className="grid cols-4">
          {LINKS.map(([label, to]) => (
            <Link key={to} to={to} className="muted">{label}</Link>
          ))}
        </div>
        <p className="muted" style={{ marginTop: 24 }}>
          © {new Date().getFullYear()} {brand}. All rights reserved.
        </p>
      </div>
    </footer>
  );
}
