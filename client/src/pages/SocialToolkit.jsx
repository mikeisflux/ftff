import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api.js';

// Promotional assets exhibitors can download to announce their booth. Our own
// branded "See us at" images in three common social sizes.
const IMAGES = [
  { src: '/retailers/toolkit-landscape.png', label: 'Landscape (1200×630)' },
  { src: '/retailers/toolkit-square.png', label: 'Square (1080×1080)' },
  { src: '/retailers/toolkit-story.png', label: 'Story (1080×1350)' },
];

const TIPS = [
  'Drop your aisle and booth number right in the caption so fans can find you fast.',
  'Tag us and use #ForTheFansFest and #FTFF2026 so your posts ride the show hashtag.',
  'Reshare posts from guests, creators, and fellow exhibitors to build momentum together.',
  'Lean on short video and reels — they travel further than a flat image.',
];

const SAMPLE_POSTS = [
  'Big news — we’re setting up shop at #ForTheFansFest 2026! Swing by our booth for exclusives you won’t find anywhere else.',
  'One week out from #FTFF2026 and we can’t wait. Find us all weekend at booth [your booth #] — we’ve got something special for you.',
  'We’re unpacked and ready! Come say hi at booth [your booth #]. #FTFF2026',
  'Day one at #ForTheFansFest is in the books and it was a blast. Doors open again tomorrow — visit us at booth [your booth #]!',
  'That’s a wrap on #FTFF2026! Huge thanks to everyone who stopped by our booth. See you next year. 🤘',
];

const SOCIALS = [
  ['Facebook', 'social.facebook'],
  ['Instagram', 'social.instagram'],
  ['X', 'social.x'],
  ['TikTok', 'social.tiktok'],
  ['YouTube', 'social.youtube'],
];

export default function SocialToolkit() {
  const { data } = useQuery({ queryKey: ['public-config'], queryFn: () => api('/public-config') });
  const social = data?.social || {};
  const links = SOCIALS.map(([label, key]) => [label, social[label.toLowerCase()] || social[key]]).filter(([, url]) => url);

  return (
    <div className="section container">
      <h1 className="glow">Exhibitor Social Media Tool Kit</h1>
      <p style={{ fontSize: '1.1rem', maxWidth: 860 }}>
        We can’t wait to see you at For The Fans Fest. Use the assets below to tell your fans you’ll be on the show
        floor — drop them on your site, your socials, and your newsletter.
      </p>

      <h2 className="glow" style={{ marginTop: 32 }}>Show logo</h2>
      <p className="muted">Use our wordmark when you promote your appearance. Please keep it unaltered.</p>
      <div className="card" style={{ display: 'inline-block', background: 'var(--color-surface)' }}>
        <img src="/ftfflogo.png" alt="For The Fans Fest" style={{ height: 64, display: 'block' }} />
      </div>
      <p style={{ marginTop: 12 }}>
        <a className="btn secondary" href="/ftfflogo.png" download>Download logo</a>
      </p>

      <h2 className="glow" style={{ marginTop: 40 }}>Social media images</h2>
      <p className="muted">Ready-to-post “See us at” graphics in three sizes. Click any image to download.</p>
      <div className="grid cols-3">
        {IMAGES.map((im) => (
          <div className="card" key={im.src} style={{ padding: 12 }}>
            <img src={im.src} alt={im.label} style={{ width: '100%', borderRadius: 8, display: 'block' }} />
            <p style={{ margin: '10px 0 6px', fontWeight: 600 }}>{im.label}</p>
            <a className="btn secondary" href={im.src} download>Download</a>
          </div>
        ))}
      </div>

      <h2 className="glow" style={{ marginTop: 40 }}>Social tips &amp; tricks</h2>
      <ul style={{ lineHeight: 1.9, maxWidth: 860 }}>
        {TIPS.map((t) => <li key={t}>{t}</li>)}
      </ul>

      <h3 style={{ marginTop: 24 }}>Sample posts you can copy</h3>
      <ul style={{ lineHeight: 1.9, maxWidth: 860 }}>
        {SAMPLE_POSTS.map((p) => <li key={p}>{p}</li>)}
      </ul>

      <h2 className="glow" style={{ marginTop: 40 }}>Follow &amp; tag us</h2>
      <p className="muted" style={{ maxWidth: 860 }}>
        Show news, guest reveals, and know-before-you-go updates go out across our official channels. Tag and follow
        us when you post so we can share your content too.
      </p>
      {links.length > 0 ? (
        <p>{links.map(([label, url], i) => (
          <span key={label}>{i > 0 && ' · '}<a href={url} target="_blank" rel="noopener">{label}</a></span>
        ))}</p>
      ) : (
        <p className="muted">Our social links will appear here soon.</p>
      )}
    </div>
  );
}
