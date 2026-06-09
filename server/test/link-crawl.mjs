// Live crawl: verifies every nav/footer/functional/admin route serves the SPA
// (200) and that every public + admin API endpoint the client depends on is
// reachable (non-404). Run against a server that serves the built client/dist.
import argon2 from 'argon2';
import { pool } from '../src/db/pool.js';

const ORIGIN = 'http://localhost:4000';
const API = `${ORIGIN}/api/v1`;
let fails = 0;
const bad = [];
function check(ok, label) { if (!ok) { fails += 1; bad.push(label); } }

function jarFrom(res, jar = {}) { for (const c of res.headers.getSetCookie?.() || []) { const [p] = c.split(';'); const i = p.indexOf('='); jar[p.slice(0, i)] = p.slice(i + 1); } return jar; }
const cookie = (j) => Object.entries(j).map(([k, v]) => `${k}=${v}`).join('; ');

const FOOTER = ['/show-hours', '/contact-us', '/sign-up', '/media-inquiries', '/become-an-exhibitor', '/faqs', '/policies', '/accessibility'];
const FUNCTIONAL = ['/', '/buy-tickets', '/floor-plan', '/shop', '/cart', '/virtual', '/all-guests', '/celebrities',
  '/animation-voices', '/anime-guests', '/gaming-stars', '/comic-creators', '/cosplayers', '/suggest-a-guest',
  '/panel-submission', '/crew', '/professional-creators', '/cosplay-guest', '/community', '/about-us', '/newsletter/confirmed'];
const ADMIN_ROUTES = ['/admin/login', '/admin', '/admin/dashboard', '/admin/tickets', '/admin/booths', '/admin/slides',
  '/admin/guests', '/admin/faqs', '/admin/show-info', '/admin/ticket-types', '/admin/nav', '/admin/pages', '/admin/theme',
  '/admin/products', '/admin/orders', '/admin/mail', '/admin/stream', '/admin/chat', '/admin/submissions', '/admin/users',
  '/admin/audit', '/admin/scan', '/admin/settings'];

const PUBLIC_API = ['/slides', '/show-info', '/guests', '/guests?featured=true', '/ticket-types', '/faqs', '/nav',
  '/booths', '/products', '/theme', '/public-config'];
const ADMIN_API = ['/admin/settings', '/admin/theme', '/admin/tickets', '/admin/tickets/stats', '/admin/dashboard',
  '/admin/orders', '/admin/products', '/admin/booths', '/admin/slides', '/admin/faqs', '/admin/show-info',
  '/admin/ticket-types', '/admin/guests', '/admin/nav', '/admin/pages', '/admin/audit', '/admin/submissions?kind=contact',
  '/admin/newsletter', '/admin/applications', '/admin/users', '/admin/email/folders', '/admin/email/messages?folder=inbox',
  '/admin/stream', '/admin/chat', '/validate/manifest'];

async function getHtml(route) {
  const res = await fetch(`${ORIGIN}${route}`);
  const body = await res.text();
  return res.status === 200 && body.includes('id="root"');
}

async function main() {
  // Build the full route set: footer + functional + every nav route (top+child).
  const nav = (await (await fetch(`${API}/nav`)).json()).nav;
  const navRoutes = [];
  for (const top of nav) {
    if (top.route) navRoutes.push(top.route);
    for (const c of top.children || []) if (c.route) navRoutes.push(c.route);
  }
  const publicRoutes = [...new Set([...FUNCTIONAL, ...FOOTER, ...navRoutes])];

  console.log(`Crawling ${publicRoutes.length} public routes…`);
  for (const r of publicRoutes) {
    // eslint-disable-next-line no-await-in-loop
    const ok = await getHtml(r);
    check(ok, `PUBLIC ROUTE ${r}`);
  }

  console.log(`Crawling ${ADMIN_ROUTES.length} admin routes…`);
  for (const r of ADMIN_ROUTES) {
    // eslint-disable-next-line no-await-in-loop
    const ok = await getHtml(r);
    check(ok, `ADMIN ROUTE ${r}`);
  }

  console.log(`Checking ${PUBLIC_API.length} public API endpoints…`);
  for (const p of PUBLIC_API) {
    // eslint-disable-next-line no-await-in-loop
    const res = await fetch(`${API}${p}`);
    check(res.status === 200, `PUBLIC API ${p} (${res.status})`);
  }

  // Admin login (dedicated admin to avoid depending on real superuser password).
  const hash = await argon2.hash('crawlpass12345', { type: argon2.argon2id });
  await pool.query(`INSERT INTO users (email,name,role,password_hash,is_active) VALUES ('crawl@test.local','C','admin',$1,TRUE) ON CONFLICT (email) DO UPDATE SET password_hash=EXCLUDED.password_hash, role='admin', is_active=TRUE`, [hash]);
  const lr = await fetch(`${API}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'crawl@test.local', password: 'crawlpass12345' }) });
  const jar = jarFrom(lr);

  console.log(`Checking ${ADMIN_API.length} admin API endpoints…`);
  for (const p of ADMIN_API) {
    // eslint-disable-next-line no-await-in-loop
    const res = await fetch(`${API}${p}`, { headers: { Cookie: cookie(jar) } });
    check(res.status === 200, `ADMIN API ${p} (${res.status})`);
  }

  // Which nav routes are authored CMS pages vs. honest in-preparation (info only).
  const pages = new Set((await pool.query(`SELECT slug FROM pages WHERE is_published=TRUE`)).rows.map((r) => r.slug));
  const functionalSet = new Set(publicRoutes.filter((r) => !navRoutes.includes(r) || ['/shop', '/all-guests', '/buy-tickets', '/floor-plan'].includes(r)));
  const inPrep = navRoutes.filter((r) => {
    const slug = r.replace(/^\//, '');
    return !pages.has(slug) && !functionalSet.has(r)
      && !FUNCTIONAL.includes(r);
  });

  console.log('\n──────────── RESULT ────────────');
  console.log(`Public routes OK : ${publicRoutes.length - bad.filter((b) => b.startsWith('PUBLIC ROUTE')).length}/${publicRoutes.length}`);
  console.log(`Admin routes OK  : ${ADMIN_ROUTES.length - bad.filter((b) => b.startsWith('ADMIN ROUTE')).length}/${ADMIN_ROUTES.length}`);
  console.log(`Public APIs OK   : ${PUBLIC_API.length - bad.filter((b) => b.startsWith('PUBLIC API')).length}/${PUBLIC_API.length}`);
  console.log(`Admin APIs OK    : ${ADMIN_API.length - bad.filter((b) => b.startsWith('ADMIN API')).length}/${ADMIN_API.length}`);
  console.log(`Nav CMS pages awaiting content (render an honest "in preparation" page, NOT dead): ${inPrep.length}`);
  if (inPrep.length) console.log('  ' + inPrep.join(', '));

  if (fails) { console.log('\n❌ FAILURES:'); bad.forEach((b) => console.log('  - ' + b)); process.exit(1); }
  console.log('\n✅ ALL ROUTES + APIS RESOLVE — no dead links, no missing endpoints.');
  await pool.end();
}

main().catch((e) => { console.error('CRAWL ERROR:', e.message); process.exit(1); });
