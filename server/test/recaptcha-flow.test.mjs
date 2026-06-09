// E2E for reCAPTCHA gating (§7.2). Config-gated: with no secret set, forms pass
// through; with a secret set, a missing token is rejected. (We don't call
// Google here — the enforcement branch is what we verify.)
import assert from 'node:assert';
import { pool } from '../src/db/pool.js';
import { setSetting, clearSetting } from '../src/lib/settings.js';

const BASE = process.env.BASE || 'http://localhost:4000/api/v1';
const post = (p, b) => fetch(`${BASE}${p}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) });

async function main() {
  // Unconfigured -> form passes (skips verification).
  await clearSetting('recaptcha.secret', null);
  const open = await post('/newsletter', { email: `r-${Date.now()}@test.local` });
  assert.equal(open.status, 200, 'form works when reCAPTCHA unconfigured');
  console.log('  ✓ unconfigured -> forms pass through');

  // Configured but no token -> rejected.
  await setSetting('recaptcha.secret', 'test_secret_value', null);
  const noTok = await post('/contact', { name: 'X', email: 'x@y.com', message: 'hello there' });
  assert.equal(noTok.status, 403, 'missing reCAPTCHA token rejected');
  assert.equal((await noTok.json()).code, 'recaptcha', 'clear reason');
  console.log('  ✓ configured + missing token -> 403 recaptcha');

  // Restore so other suites/runs aren't affected.
  await clearSetting('recaptcha.secret', null);
  console.log('\nALL RECAPTCHA-FLOW ASSERTIONS PASSED');
  await pool.end();
}

main().catch((e) => { console.error('TEST FAILED:', e.message); process.exit(1); });
