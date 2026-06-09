// E2E for Virtual Con live chat (§11): WebSocket auth via the stream entitlement
// token, broadcast + persistence, profanity masking, unauthorized rejection,
// and moderation hide broadcasting to clients.
import assert from 'node:assert';
import jwt from 'jsonwebtoken';
import argon2 from 'argon2';
import { WebSocket } from 'ws';
import { pool } from '../src/db/pool.js';

const BASE = process.env.BASE || 'http://localhost:4000/api/v1';
const WS = 'ws://localhost:4000/ws/chat';
const SECRET = 'dev_only_jwt_secret_change_me_0123456789abcdef0123456789abcdef';

const next = (ws) => new Promise((res) => { ws.once('message', (d) => res(JSON.parse(d.toString()))); });
const open = (ws) => new Promise((res, rej) => { ws.once('open', res); ws.once('error', rej); });

function jarFrom(res, jar = {}) { for (const c of res.headers.getSetCookie?.() || []) { const [p] = c.split(';'); const i = p.indexOf('='); jar[p.slice(0, i)] = p.slice(i + 1); } return jar; }
const cookie = (j) => Object.entries(j).map(([k, v]) => `${k}=${v}`).join('; ');

async function main() {
  const streamToken = jwt.sign({ typ: 'stream', ent: 'digital' }, SECRET, { expiresIn: 600 });

  // Unauthorized (no token) is rejected.
  const bad = new WebSocket(WS);
  const badClosed = await new Promise((res) => { bad.on('close', (code) => res(code)); bad.on('error', () => {}); });
  assert.equal(badClosed, 4401, 'no token -> closed 4401');
  console.log('  ✓ unauthorized WS rejected (4401)');

  // Authorized viewer connects, gets history, sends a message, hears it back.
  const a = new WebSocket(`${WS}?token=${streamToken}`);
  await open(a);
  const hist = await next(a);
  assert.equal(hist.type, 'history', 'history sent on join');

  const b = new WebSocket(`${WS}?token=${streamToken}`);
  await open(b);
  await next(b); // its history

  const recv = next(b);
  a.send(JSON.stringify({ type: 'msg', handle: 'Alice', body: 'hello fucking world' }));
  const got = await recv;
  assert.equal(got.type, 'msg', 'broadcast received by other client');
  assert.equal(got.handle, 'Alice');
  assert.ok(got.body.includes('*'), 'profanity masked');
  console.log('  ✓ viewer chat broadcast + profanity masked');

  // Persisted + moderation: admin hides it; both clients get a hide event.
  const row = (await pool.query(`SELECT id FROM chat_messages WHERE handle='Alice' ORDER BY created_at DESC LIMIT 1`)).rows[0];
  assert.ok(row, 'message persisted');

  const hash = await argon2.hash('adminpass12345', { type: argon2.argon2id });
  await pool.query(`INSERT INTO users (email,name,role,password_hash,is_active) VALUES ('chat@test.local','C','admin',$1,TRUE) ON CONFLICT (email) DO UPDATE SET password_hash=EXCLUDED.password_hash, role='admin', is_active=TRUE`, [hash]);
  const lr = await fetch(`${BASE}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'chat@test.local', password: 'adminpass12345' }) });
  const jar = jarFrom(lr);

  const hideEvent = next(a);
  const modRes = await fetch(`${BASE}/admin/chat/${row.id}/hide`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie(jar), 'X-CSRF-Token': jar.csrf_token },
    body: JSON.stringify({ hidden: true }),
  });
  assert.equal(modRes.status, 200, 'moderation hide ok');
  const ev = await hideEvent;
  assert.equal(ev.type, 'hide', 'clients told to hide message');
  assert.equal(ev.id, row.id);
  console.log('  ✓ moderation hide persists + broadcasts to clients');

  a.close(); b.close();
  console.log('\nALL CHAT-FLOW ASSERTIONS PASSED');
  await pool.end();
}

main().catch((e) => { console.error('TEST FAILED:', e.message); process.exit(1); });
