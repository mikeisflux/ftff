// E2E for §13 content management: slides CRUD+reorder, FAQ, guests featured
// cap (8), page builder publish + version restore, theme save validation.
import assert from 'node:assert';
import argon2 from 'argon2';
import { pool } from '../src/db/pool.js';

const BASE = process.env.BASE || 'http://localhost:4000/api/v1';
function jarFrom(res, jar = {}) { for (const c of res.headers.getSetCookie?.() || []) { const [p] = c.split(';'); const i = p.indexOf('='); jar[p.slice(0, i)] = p.slice(i + 1); } return jar; }
const cookie = (j) => Object.entries(j).map(([k, v]) => `${k}=${v}`).join('; ');

async function main() {
  const hash = await argon2.hash('adminpass12345', { type: argon2.argon2id });
  await pool.query(`INSERT INTO users (email,name,role,password_hash,is_active) VALUES ('content@test.local','C','admin',$1,TRUE) ON CONFLICT (email) DO UPDATE SET password_hash=EXCLUDED.password_hash, role='admin', is_active=TRUE`, [hash]);
  const lr = await fetch(`${BASE}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'content@test.local', password: 'adminpass12345' }) });
  const jar = jarFrom(lr);
  const H = { 'Content-Type': 'application/json', Cookie: cookie(jar), 'X-CSRF-Token': jar.csrf_token };
  const POST = (p, b) => fetch(`${BASE}${p}`, { method: 'POST', headers: H, body: JSON.stringify(b) });
  const GET = (p) => fetch(`${BASE}${p}`, { headers: { Cookie: cookie(jar) } }).then((r) => r.json());

  // Slides CRUD + reorder.
  const s1 = (await (await POST('/admin/slides', { image_url: 'https://x/a.png', title: 'A' })).json()).slide;
  const s2 = (await (await POST('/admin/slides', { image_url: 'https://x/b.png', title: 'B' })).json()).slide;
  const ro = await POST('/admin/slides/reorder', { orderedIds: [s2.id, s1.id] });
  assert.equal(ro.status, 200, 'reorder ok');
  const order = (await GET('/admin/slides')).slides.map((s) => s.id);
  // Robust to pre-existing slides: assert s2 now sorts before s1.
  assert.ok(order.indexOf(s2.id) < order.indexOf(s1.id), 'reorder persisted (s2 before s1)');
  console.log('  ✓ slides CRUD + drag-reorder');

  // Guests featured cap (8).
  await pool.query(`UPDATE guests SET is_featured=FALSE`); // reset
  for (let i = 0; i < 8; i += 1) {
    await POST('/admin/guests', { name: `G${i}`, category: 'celebrities', is_featured: true });
  }
  const ninth = await POST('/admin/guests', { name: 'G9', category: 'celebrities', is_featured: true });
  assert.equal(ninth.status, 400, '9th featured rejected');
  console.log('  ✓ guest featured cap enforced (max 8)');

  // Page builder: create -> save blocks -> publish (renders html + version) -> restore.
  const slug = `pb-${Date.now()}`;
  const page = (await (await POST('/admin/pages', { slug, title: 'PB' })).json()).page;
  await fetch(`${BASE}/admin/pages/${page.id}`, { method: 'PUT', headers: H, body: JSON.stringify({ blocks: [{ type: 'heading', data: { text: 'Hello' } }, { type: 'richtext', data: { html: '<p>Hi<script>alert(1)</script></p>' } }] }) });
  const pub = await (await POST(`/admin/pages/${page.id}/publish`, {})).json();
  assert.ok(pub.page.body_html.includes('<h2>Hello</h2>'), 'heading rendered');
  assert.ok(!pub.page.body_html.includes('<script'), 'richtext sanitized in cache');
  const pubGet = await (await fetch(`${BASE}/pages/${slug}`)).json();
  assert.equal(pubGet.page.slug, slug, 'page publicly published');
  const versions = (await GET(`/admin/pages/${page.id}/versions`)).versions;
  assert.ok(versions.length >= 1, 'version snapshot created on publish');
  const restored = await POST(`/admin/pages/${page.id}/restore/${versions[0].id}`, {});
  assert.equal(restored.status, 200, 'restore ok');
  console.log('  ✓ page builder: publish renders+sanitizes, versions + restore');

  // Theme save: reject an invalid (non-hex) color.
  const theme = (await GET('/admin/theme')).theme;
  const bad = await fetch(`${BASE}/admin/theme`, { method: 'PUT', headers: H, body: JSON.stringify({ ...theme, tokens: { ...theme.tokens, dark: { ...theme.tokens.dark, primary: 'red; evil' } } }) });
  assert.equal(bad.status, 400, 'invalid color rejected (no CSS injection)');
  console.log('  ✓ theme studio rejects invalid color (CSS-injection guard)');

  // Ticket types CRUD: create + delete unused; in-use type can't be deleted.
  const ttA = (await (await POST('/admin/ticket-types', { code: `vip_${Date.now()}`, name: 'VIP', price_cents: 15000 })).json()).ticketType;
  assert.ok(ttA?.id, 'ticket type created');
  const delA = await fetch(`${BASE}/admin/ticket-types/${ttA.id}`, { method: 'DELETE', headers: H });
  assert.equal(delA.status, 200, 'unused ticket type deleted');
  const ttB = (await (await POST('/admin/ticket-types', { code: `vip2_${Date.now()}`, name: 'VIP2', price_cents: 15000 })).json()).ticketType;
  const ord = (await pool.query(`INSERT INTO orders (order_number, kind, total_cents, status) VALUES ($1,'ticket',15000,'paid') RETURNING id`, [`FFF-TT-${Date.now().toString(36)}`])).rows[0];
  await pool.query(`INSERT INTO tickets (order_id, ticket_type_id, qr_token) VALUES ($1,$2,$3)`, [ord.id, ttB.id, `tt_${Date.now()}`]);
  const delB = await fetch(`${BASE}/admin/ticket-types/${ttB.id}`, { method: 'DELETE', headers: H });
  assert.equal(delB.status, 409, 'in-use ticket type delete blocked');
  console.log('  ✓ ticket types CRUD (create, unused delete, in-use delete blocked)');

  console.log('\nALL CONTENT-FLOW ASSERTIONS PASSED');
  await pool.end();
}

main().catch((e) => { console.error('TEST FAILED:', e.message); process.exit(1); });
