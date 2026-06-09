import { useEffect, useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { api } from '../lib/api.js';

// Shared admin shell: auth guard + grouped sidebar nav + logout. Door-staff are
// limited to the scanner; admin/editor see the full menu (role-gated server-side
// too). Items are organized into functional categories.
const NAV_GROUPS = [
  { label: 'Overview', items: [
    { to: '/admin/dashboard', label: 'Dashboard', roles: ['admin', 'editor'] },
  ] },
  { label: 'Sales & Tickets', items: [
    { to: '/admin/orders', label: 'Orders', roles: ['admin'] },
    { to: '/admin/tickets', label: 'Tickets', roles: ['admin'] },
    { to: '/admin/ticket-types', label: 'Ticket Types', roles: ['admin'] },
  ] },
  { label: 'Store & Vendors', items: [
    { to: '/admin/products', label: 'Shop', roles: ['admin', 'editor'] },
    { to: '/admin/special-experiences', label: 'Special Experiences', roles: ['admin', 'editor'] },
    { to: '/admin/autographs', label: 'Autographs', roles: ['admin', 'editor'] },
    { to: '/admin/photo-ops', label: 'Photo Ops', roles: ['admin', 'editor'] },
    { to: '/admin/discounts', label: 'Discounts', roles: ['admin', 'editor'] },
    { to: '/admin/booths', label: 'Floor Plan', roles: ['admin', 'editor'] },
    { to: '/admin/exhibitors', label: 'Exhibitors', roles: ['admin', 'editor'] },
  ] },
  { label: 'Content', items: [
    { to: '/admin/pages', label: 'Page Builder', roles: ['admin', 'editor'] },
    { to: '/admin/guests', label: 'Guests', roles: ['admin', 'editor'] },
    { to: '/admin/slides', label: 'Hero Slides', roles: ['admin', 'editor'] },
    { to: '/admin/nav', label: 'Navigation', roles: ['admin', 'editor'] },
    { to: '/admin/faqs', label: 'FAQs', roles: ['admin', 'editor'] },
    { to: '/admin/show-info', label: 'Show Info', roles: ['admin', 'editor'] },
    { to: '/admin/theme', label: 'Theme & Branding', roles: ['admin'] },
  ] },
  { label: 'Communication', items: [
    { to: '/admin/mail', label: 'Mail', roles: ['admin', 'editor'] },
    { to: '/admin/submissions', label: 'Submissions', roles: ['admin', 'editor'] },
    { to: '/admin/stream', label: 'Livestream', roles: ['admin', 'editor'] },
    { to: '/admin/chat', label: 'Chat Moderation', roles: ['admin', 'editor'] },
  ] },
  { label: 'Administration', items: [
    { to: '/admin/users', label: 'Users & Roles', roles: ['admin'] },
    { to: '/admin/audit', label: 'Audit Log', roles: ['admin'] },
    { to: '/admin/settings', label: 'Settings', roles: ['admin'] },
  ] },
];

export default function AdminLayout() {
  const nav = useNavigate();
  const [me, setMe] = useState(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    api('/auth/me')
      .then(({ user }) => {
        // Door staff have no admin access — send them to the standalone scanner.
        if (user.role === 'door_staff') { nav('/scan'); return; }
        setMe(user); setReady(true);
      })
      .catch(() => nav('/admin/login'));
  }, [nav]);

  async function logout() {
    await api('/auth/logout', { method: 'POST' }).catch(() => {});
    nav('/admin/login');
  }

  if (!ready) return <div className="section container"><p className="muted">Loading…</p></div>;

  // Keep only groups that have at least one item visible to this role.
  const groups = NAV_GROUPS
    .map((g) => ({ ...g, items: g.items.filter((n) => n.roles.includes(me.role)) }))
    .filter((g) => g.items.length > 0);

  return (
    <div className="admin-shell">
      <aside className="admin-sidebar">
        <div className="brand glow" style={{ padding: '0 8px 16px' }}>Admin</div>
        <nav>
          {groups.map((g) => (
            <div key={g.label} className="admin-group">
              <div className="admin-group-label">{g.label}</div>
              {g.items.map((n) => (
                <NavLink
                  key={n.to}
                  to={n.to}
                  className={({ isActive }) => (isActive ? 'admin-link active' : 'admin-link')}
                >
                  {n.label}
                </NavLink>
              ))}
            </div>
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
