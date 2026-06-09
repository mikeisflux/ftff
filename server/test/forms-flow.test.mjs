// E2E for newsletter double opt-in + Apply-section applications (§7.0, §7.2).
import assert from 'node:assert';
import argon2 from 'argon2';
import { pool } from '../src/db/pool.js';
import { clearSetting } from '../src/lib/settings.js';

const BASE = process.env.BASE || 'http://localhost:4000/api/v1';
function jarFrom(res, jar = {}) { for (const c of res.headers.getSetCookie?.() || []) { const [p] = c.split(';'); const i = p.indexOf('='); jar[p.slice(0, i)] = p.slice(i + 1); } return jar; }
const cookie = (j) => Object.entries(j).map(([k, v]) => `${k}=${v}`).join('; ');
const post = (p, b) => fetch(`${BASE}${p}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) });

async function main() {
  await clearSetting('recaptcha.secret', null); // forms pass through

  // Newsletter double opt-in.
  const email = `news-${Date.now()}@test.local`;
  const r1 = await post('/newsletter', { email });
  assert.equal(r1.status, 200, 'signup ok');
  const sub = (await pool.query(`SELECT status, confirm_token FROM newsletter_subscribers WHERE email=$1`, [email])).rows[0];
  assert.equal(sub.status, 'pending', 'starts pending (double opt-in)');
  assert.ok(sub.confirm_token, 'confirm token issued');
  console.log('  ✓ newsletter signup -> pending + confirm token');

  const conf = await fetch(`${BASE}/newsletter/confirm?token=${sub.confirm_token}`, { redirect: 'manual' });
  assert.ok(conf.status === 302 || conf.status === 0 || conf.status === 200, 'confirm redirects');
  const after = (await pool.query(`SELECT status FROM newsletter_subscribers WHERE email=$1`, [email])).rows[0];
  assert.equal(after.status, 'subscribed', 'confirmed -> subscribed');
  console.log('  ✓ confirm link -> subscribed');

  const unsub = await fetch(`${BASE}/newsletter/unsubscribe?token=${sub.confirm_token}`, { redirect: 'manual' });
  assert.ok(unsub.status === 302 || unsub.status === 0 || unsub.status === 200, 'unsub redirects');
  const gone = (await pool.query(`SELECT status FROM newsletter_subscribers WHERE email=$1`, [email])).rows[0];
  assert.equal(gone.status, 'unsubscribed', 'unsubscribed');
  console.log('  ✓ unsubscribe link -> unsubscribed');

  // Applications.
  const ap = await post('/apply/panel', { name: 'Panelist', email: 'p@test.local', message: 'My panel about comics' });
  assert.equal(ap.status, 200, 'application accepted');
  const badKind = await post('/apply/nonsense', { name: 'x', email: 'x@y.com', message: 'hi there' });
  assert.equal(badKind.status, 404, 'unknown application kind rejected');
  console.log('  ✓ apply/:kind stores valid, rejects unknown kind');

  // Admin sees the application.
  const hash = await argon2.hash('adminpass12345', { type: argon2.argon2id });
  await pool.query(`INSERT INTO users (email,name,role,password_hash,is_active) VALUES ('apps@test.local','A','admin',$1,TRUE) ON CONFLICT (email) DO UPDATE SET password_hash=EXCLUDED.password_hash, role='admin', is_active=TRUE`, [hash]);
  const lr = await post('/auth/login', { email: 'apps@test.local', password: 'adminpass12345' });
  const jar = jarFrom(lr);
  const list = await (await fetch(`${BASE}/admin/applications?kind=panel`, { headers: { Cookie: cookie(jar) } })).json();
  assert.ok(list.applications.some((a) => a.email === 'p@test.local'), 'application listed in admin');
  console.log('  ✓ admin applications inbox lists it');

  console.log('\nALL FORMS-FLOW ASSERTIONS PASSED');
  await pool.end();
}

main().catch((e) => { console.error('TEST FAILED:', e.message); process.exit(1); });
