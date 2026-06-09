// E2E for the BotBlock integration. Configures a low threshold + temp pending
// file, then drives recordSuspicious for a public IP and asserts it escalates to
// a block (DB row + in-memory cache + pending file written for the watcher).
// Loopback/private IPs must never be blocked.
import assert from 'node:assert';
import { readFileSync, rmSync } from 'node:fs';

process.env.BOTBLOCK_PENDING_FILE = '/tmp/botblock-test-pending';
process.env.BOTBLOCK_THRESHOLD = '3';
process.env.BOTBLOCK_WINDOW_MINUTES = '60';

const { recordSuspicious, isBlockedCached, normalizeIp } = await import('../src/lib/botblock.js');
const { pool } = await import('../src/db/pool.js');

async function main() {
  try { rmSync(process.env.BOTBLOCK_PENDING_FILE); } catch { /* noop */ }

  // IP normalization + private/loopback exemption.
  assert.equal(normalizeIp('127.0.0.1'), null, 'loopback exempt');
  assert.equal(normalizeIp('10.1.2.3'), null, 'private exempt');
  assert.equal(normalizeIp('192.168.0.9'), null, 'private exempt');
  assert.equal(normalizeIp('::ffff:203.0.113.7'), '203.0.113.7', 'ipv4-mapped normalized');
  assert.equal(normalizeIp('203.0.113.7'), '203.0.113.7', 'public ipv4 kept');
  console.log('  ✓ IP normalization + private/loopback exemption');

  const ip = `203.0.113.${Math.floor(Math.random() * 200) + 1}`;
  await pool.query('DELETE FROM "BlockedIP" WHERE "ipAddress"=$1', [ip]);
  await pool.query('DELETE FROM "SuspiciousActivity" WHERE "ipAddress"=$1', [ip]);

  // Below threshold: logged, not blocked.
  await recordSuspicious(ip, 'test_strike', { path: '/x' });
  await recordSuspicious(ip, 'test_strike', { path: '/x' });
  assert.equal(isBlockedCached(ip), false, 'not blocked below threshold');
  const logged = (await pool.query('SELECT count(*)::int n FROM "SuspiciousActivity" WHERE "ipAddress"=$1', [ip])).rows[0].n;
  assert.equal(logged, 2, 'suspicious activity logged');
  console.log('  ✓ suspicious activity logged, no block below threshold');

  // Crossing threshold blocks.
  await recordSuspicious(ip, 'test_strike', { path: '/x', userAgent: 'curl' });
  assert.equal(isBlockedCached(ip), true, 'blocked at threshold (cache)');
  const row = (await pool.query('SELECT "expiresAt" > NOW() AS active, "reason" FROM "BlockedIP" WHERE "ipAddress"=$1', [ip])).rows[0];
  assert.ok(row?.active, 'BlockedIP row active');
  const pending = readFileSync(process.env.BOTBLOCK_PENDING_FILE, 'utf8');
  assert.ok(pending.split('\n').includes(ip), 'IP written to watcher pending file');
  console.log('  ✓ threshold -> blocked (DB + cache + pending file for watcher)');

  // Loopback never blocks no matter how many strikes.
  for (let i = 0; i < 6; i += 1) await recordSuspicious('127.0.0.1', 'test_strike', {});
  assert.equal(isBlockedCached('127.0.0.1'), false, 'loopback never blocked');
  console.log('  ✓ loopback never blocked');

  // cleanup
  await pool.query('DELETE FROM "BlockedIP" WHERE "ipAddress"=$1', [ip]);
  await pool.query('DELETE FROM "SuspiciousActivity" WHERE "ipAddress"=$1', [ip]);
  console.log('\nALL BOTBLOCK-FLOW ASSERTIONS PASSED');
  await pool.end();
}

main().catch((e) => { console.error('TEST FAILED:', e.message); process.exit(1); });
