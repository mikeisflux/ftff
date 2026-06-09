import { useEffect, useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { api } from '../lib/api.js';

// Shared admin shell: auth guard + sidebar nav + logout. Door-staff are limited
// to the scanner; admin/editor see the full menu (role-gated server-side too).
const NAV = [
  { to: '/admin/dashboard', label: 'Dashboard', roles: ['admin', 'editor'] },
  { to: '/admin/tickets', label: 'Tickets', roles: ['admin'] },
  { to: '/admin/orders', label: 'Orders', roles: ['admin'] },
  { to: '/admin/mail', label: 'Mail', roles: ['admin', 'editor'] },
  { to: '/admin/stream', label: 'Livestream', roles: ['admin', 'editor'] },
  { to: '/admin/products', label: 'Products', roles: ['admin', 'editor'] },
  { to: '/admin/booths', label: 'Floor Plan', roles: ['admin', 'editor'] },
  { to: '/admin/scan', label: 'Scan / Check-in', roles: ['admin', 'door_staff'] },
  { to: '/admin/pages', label: 'Page Builder', roles: ['admin', 'editor'] },
  { to: '/admin/guests', label: 'Guests', roles: ['admin', 'editor'] },
  { to: '/admin/slides', label: 'Hero Slides', roles: ['admin', 'editor'] },
  { to: '/admin/nav', label: 'Navigation', roles: ['admin', 'editor'] },
  { to: '/admin/theme', label: 'Theme & Branding', roles: ['admin'] },
  { to: '/admin/faqs', label: 'FAQs', roles: ['admin', 'editor'] },
  { to: '/admin/ticket-types', label: 'Ticket Types', roles: ['admin'] },
  { to: '/admin/show-info', label: 'Show Info', roles: ['admin', 'editor'] },
  { to: '/admin/submissions', label: 'Submissions', roles: ['admin', 'editor'] },
  { to: '/admin/users', label: 'Users & Roles', roles: ['admin'] },
  { to: '/admin/audit', label: 'Audit Log', roles: ['admin'] },
  { to: '/admin/settings', label: 'Settings', roles: ['admin'] },
];

export default function AdminLayout() {
  const nav = useNavigate();
  const [me, setMe] = useState(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    api('/auth/me')
      .then(({ user }) => { setMe(user); setReady(true); })
      .catch(() => nav('/admin/login'));
  }, [nav]);

  async function logout() {
    await api('/auth/logout', { method: 'POST' }).catch(() => {});
    nav('/admin/login');
  }

  if (!ready) return <div className="section container"><p className="muted">Loading…</p></div>;

  const items = NAV.filter((n) => n.roles.includes(me.role));

  return (
    <div className="admin-shell">
      <aside className="admin-sidebar">
        <div className="brand glow" style={{ padding: '0 8px 16px' }}>Admin</div>
        <nav>
          {items.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              className={({ isActive }) => (isActive ? 'admin-link active' : 'admin-link')}
            >
              {n.label}
            </NavLink>
          ))}
        </nav>
        <div style={{ marginTop: 'auto', paddingTop: 16 }}>
          <p className="muted" style={{ fontSize: '.8rem' }}>{me.email}<br />{me.role}</p>
          <button className="btn secondary" onClick={logout}>Log out</button>
        </div>
      </aside>
      <main className="admin-main">
        <Outlet context={{ me }} />
      </main>
    </div>
  );
}
