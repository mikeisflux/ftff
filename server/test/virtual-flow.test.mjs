// E2E for the Virtual Con gate (§11): only Digital ticket holders can mint a
// playback token; the gated VOD endpoint rejects missing/invalid tokens. The
// Cloudflare API calls are config-gated and not exercised here (no network);
// the entitlement enforcement is the security-critical, fully-testable part.
import assert from 'node:assert';
import { pool } from '../src/db/pool.js';
import { randomToken } from '../src/lib/crypto.js';

const BASE = process.env.BASE || 'http://localhost:4000/api/v1';

async function issueTicket(code) {
  const tt = (await pool.query(`SELECT id FROM ticket_types WHERE code=$1`, [code])).rows[0];
  const order = (
    await pool.query(
      `INSERT INTO orders (order_number, kind, total_cents, status) VALUES ($1,'ticket',1000,'paid') RETURNING id`,
      [`FX-VC-${randomToken(2).toUpperCase()}`],
    )
  ).rows[0];
  const token = randomToken(24);
  await pool.query(
    `INSERT INTO tickets (order_id, ticket_type_id, attendee_name, qr_token) VALUES ($1,$2,'Viewer',$3)`,
    [order.id, tt.id, token],
  );
  return token;
}

const post = (body) =>
  fetch(`${BASE}/virtual/playback-token`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

async function main() {
  // Digital ticket -> entitled, gets a token.
  const digital = await issueTicket('digital');
  const ok = await post({ qr_token: digital });
  assert.equal(ok.status, 200, 'digital ticket accepted');
  const okBody = await ok.json();
  assert.equal(okBody.entitled, true, 'entitled');
  assert.ok(okBody.token, 'access token minted');
  console.log('  ✓ Digital ticket -> playback token minted');

  // Non-digital ticket -> 403.
  const friday = await issueTicket('friday');
  const no = await post({ qr_token: friday });
  assert.equal(no.status, 403, 'non-digital rejected');
  assert.equal((await no.json()).code, 'not_digital', 'clear reason');
  console.log('  ✓ non-Digital ticket -> 403 not_digital');

  // Unknown token -> 401.
  const bad = await post({ qr_token: 'deadbeefdeadbeefdeadbeef' });
  assert.equal(bad.status, 401, 'unknown token rejected');
  console.log('  ✓ unknown token -> 401');

  // VOD requires a valid entitlement token.
  const noTok = await fetch(`${BASE}/virtual/vod`);
  assert.equal(noTok.status, 401, 'VOD without token rejected');
  const withTok = await fetch(`${BASE}/virtual/vod?token=${encodeURIComponent(okBody.token)}`);
  assert.equal(withTok.status, 200, 'VOD with valid token allowed');
  console.log('  ✓ gated VOD: rejects missing token, allows valid token');

  // Public status endpoint is reachable and reports unconfigured.
  const status = await (await fetch(`${BASE}/virtual/status`)).json();
  assert.equal(typeof status.configured, 'boolean', 'status returns configured flag');
  console.log('  ✓ public stream status endpoint');

  console.log('\nALL VIRTUAL-FLOW ASSERTIONS PASSED');
  await pool.end();
}

main().catch((e) => { console.error('TEST FAILED:', e.message); process.exit(1); });
