import { Link } from 'react-router-dom';

// Customer Service footer links (§7.2).
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
          © {new Date().getFullYear()} FAN EXPO Chicago. All rights reserved.
        </p>
      </div>
    </footer>
  );
}
