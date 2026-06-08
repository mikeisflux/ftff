import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTheme } from '../theme/ThemeProvider.jsx';
import { api } from '../lib/api.js';

// Persistent header with a two-level mega-menu (§7.0): desktop dropdowns,
// mobile hamburger → full-screen accordion drawer. Plus theme toggle (§7.0a)
// and one-click share (§7.0b). Brand name/logo derive from live data — no
// hardcoded content.
export default function Header() {
  const { mode, toggle, allowToggle, theme } = useTheme();
  const { pathname } = useLocation();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [openMenu, setOpenMenu] = useState(null); // desktop dropdown id
  const [openSection, setOpenSection] = useState(null); // mobile accordion id
  const [share, setShare] = useState(false);
  const shareRef = useRef(null);

  const navQ = useQuery({ queryKey: ['nav'], queryFn: () => api('/nav') });
  const infoQ = useQuery({ queryKey: ['show-info'], queryFn: () => api('/show-info') });
  const nav = navQ.data?.nav ?? [];
  const brandName = infoQ.data?.showInfo?.name ?? 'FAN EXPO';
  const logo = mode === 'light' ? theme?.logo_light_url : theme?.logo_dark_url;
  const logoUrl = logo || theme?.logo_url;

  // Close menus on route change.
  useEffect(() => {
    setDrawerOpen(false);
    setOpenMenu(null);
    setShare(false);
  }, [pathname]);

  // Close share popover on outside click.
  useEffect(() => {
    function onDoc(e) {
      if (shareRef.current && !shareRef.current.contains(e.target)) setShare(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const shareUrl = window.location.origin;
  const title = brandName;

  async function onShare() {
    if (navigator.share) {
      try {
        await navigator.share({ title, url: shareUrl });
        return;
      } catch {
        /* user cancelled or unsupported → fall through to popover */
      }
    }
    setShare((s) => !s);
  }

  const targets = [
    ['X', `https://twitter.com/intent/tweet?url=${encodeURIComponent(shareUrl)}&text=${encodeURIComponent(title)}`],
    ['Facebook', `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}`],
    ['LinkedIn', `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(shareUrl)}`],
    ['Reddit', `https://www.reddit.com/submit?url=${encodeURIComponent(shareUrl)}&title=${encodeURIComponent(title)}`],
    ['WhatsApp', `https://wa.me/?text=${encodeURIComponent(title + ' ' + shareUrl)}`],
    ['Email', `mailto:?subject=${encodeURIComponent(title)}&body=${encodeURIComponent(shareUrl)}`],
  ];

  function NavLink({ item, onClick }) {
    const props = item.url
      ? { href: item.url, target: item.opens_new_tab ? '_blank' : undefined, rel: 'noopener' }
      : null;
    if (props) return <a {...props} onClick={onClick}>{item.label}</a>;
    return <Link to={item.route || '/'} onClick={onClick}>{item.label}</Link>;
  }

  return (
    <header className="site-header">
      <Link to="/" className="brand glow" aria-label={brandName}>
        {logoUrl ? <img src={logoUrl} alt={brandName} className="brand-logo" /> : brandName}
      </Link>

      {/* Desktop mega-menu */}
      <nav className="megamenu" aria-label="Primary">
        {nav.map((item) => {
          const hasChildren = item.children?.length > 0;
          return (
            <div
              key={item.id}
              className="menu-item"
              onMouseEnter={() => hasChildren && setOpenMenu(item.id)}
              onMouseLeave={() => setOpenMenu(null)}
            >
              {hasChildren ? (
                <button
                  className="menu-trigger"
                  aria-haspopup="true"
                  aria-expanded={openMenu === item.id}
                  onClick={() => setOpenMenu((m) => (m === item.id ? null : item.id))}
                >
                  {item.label} <span className="caret">▾</span>
                </button>
              ) : (
                <NavLink item={item} />
              )}
              {hasChildren && openMenu === item.id && (
                <div className="dropdown" role="menu">
                  {item.children.map((c) => (
                    <NavLink key={c.id} item={c} />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      <div className="header-actions">
        <Link to="/buy-tickets" className="btn cta-buy">Buy Tickets</Link>

        <div ref={shareRef} className="share-wrap">
          <button className="icon-btn" aria-label="Share this site" onClick={onShare}>🔗</button>
          {share && (
            <div className="popover" role="menu">
              {targets.map(([label, href]) => (
                <button key={label} onClick={() => window.open(href, '_blank', 'noopener')}>
                  {label}
                </button>
              ))}
              <button
                onClick={() => {
                  navigator.clipboard?.writeText(shareUrl);
                  setShare(false);
                }}
              >
                Copy Link
              </button>
            </div>
          )}
        </div>

        {allowToggle && (
          <button className="icon-btn" aria-label="Toggle light/dark theme" onClick={toggle}>
            {mode === 'dark' ? '☀️' : '🌙'}
          </button>
        )}

        <button
          className="icon-btn hamburger"
          aria-label="Open menu"
          aria-expanded={drawerOpen}
          onClick={() => setDrawerOpen((o) => !o)}
        >
          {drawerOpen ? '✕' : '☰'}
        </button>
      </div>

      {/* Mobile full-screen accordion drawer */}
      {drawerOpen && (
        <div className="drawer">
          {nav.map((item) => {
            const hasChildren = item.children?.length > 0;
            return (
              <div key={item.id} className="drawer-section">
                {hasChildren ? (
                  <>
                    <button
                      className="drawer-trigger"
                      aria-expanded={openSection === item.id}
                      onClick={() => setOpenSection((s) => (s === item.id ? null : item.id))}
                    >
                      {item.label} <span>{openSection === item.id ? '−' : '+'}</span>
                    </button>
                    {openSection === item.id && (
                      <div className="drawer-children">
                        {item.children.map((c) => (
                          <NavLink key={c.id} item={c} onClick={() => setDrawerOpen(false)} />
                        ))}
                      </div>
                    )}
                  </>
                ) : (
                  <NavLink item={item} onClick={() => setDrawerOpen(false)} />
                )}
              </div>
            );
          })}
        </div>
      )}
    </header>
  );
}
