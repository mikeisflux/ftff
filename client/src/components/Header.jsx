import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTheme } from '../theme/ThemeProvider.jsx';
import { api } from '../lib/api.js';

// Persistent header with mega-menu, theme toggle (§7.0a), and one-click share
// (§7.0b). Mobile collapses the menu into a drawer.
export default function Header() {
  const { mode, toggle, allowToggle } = useTheme();
  const [nav, setNav] = useState([]);
  const [open, setOpen] = useState(false); // mobile drawer
  const [share, setShare] = useState(false);

  useEffect(() => {
    api('/nav').then(({ nav }) => setNav(nav)).catch(() => {});
  }, []);

  const shareUrl = window.location.origin;
  const title = 'FAN EXPO Chicago';

  async function onShare() {
    if (navigator.share) {
      try {
        await navigator.share({ title, url: shareUrl });
        return;
      } catch {
        /* fall through to popover */
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

  return (
    <header className="site-header">
      <Link to="/" className="brand glow">FAN EXPO</Link>

      <nav className="nav-spacer" style={{ display: open ? 'block' : 'flex', gap: 18 }}>
        {nav.map((item) => (
          <Link
            key={item.id}
            to={item.route || '#'}
            className={item.is_cta ? 'btn' : ''}
            style={{ padding: item.is_cta ? '6px 14px' : 0 }}
          >
            {item.label}
          </Link>
        ))}
      </nav>

      <button className="icon-btn" aria-label="Share" onClick={onShare}>🔗</button>
      {share && (
        <div className="popover" role="menu">
          {targets.map(([label, href]) => (
            <button key={label} onClick={() => window.open(href, '_blank', 'noopener')}>
              {label}
            </button>
          ))}
          <button onClick={() => { navigator.clipboard?.writeText(shareUrl); setShare(false); }}>
            Copy Link
          </button>
        </div>
      )}

      {allowToggle && (
        <button className="icon-btn" aria-label="Toggle theme" onClick={toggle}>
          {mode === 'dark' ? '☀️' : '🌙'}
        </button>
      )}
    </header>
  );
}
