// Self-contained E2E runner: boots the API, waits for health, runs the
// checkout-flow assertions, then tears the server down. Usage: npm run test:e2e
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const serverEntry = path.resolve(here, '../src/index.js');
const testFiles = [
  path.resolve(here, './checkout-flow.test.mjs'),
  path.resolve(here, './validate-flow.test.mjs'),
  path.resolve(here, './booth-flow.test.mjs'),
  path.resolve(here, './store-flow.test.mjs'),
  path.resolve(here, './email-flow.test.mjs'),
  path.resolve(here, './virtual-flow.test.mjs'),
  path.resolve(here, './admin-flow.test.mjs'),
  path.resolve(here, './content-flow.test.mjs'),
  path.resolve(here, './recaptcha-flow.test.mjs'),
];
const BASE = 'http://localhost:4000/api/v1';

const server = spawn('node', [serverEntry], { stdio: ['ignore', 'pipe', 'pipe'] });
let serverLog = '';
server.stdout.on('data', (d) => { serverLog += d; });
server.stderr.on('data', (d) => { serverLog += d; });

async function waitForHealth(timeoutMs = 8000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const r = await fetch(`${BASE}/health`);
      if (r.ok) return true;
    } catch {
      /* not up yet */
    }
    await new Promise((res) => setTimeout(res, 250));
  }
  return false;
}

function cleanup(code) {
  server.kill('SIGTERM');
  process.exit(code);
}

const ok = await waitForHealth();
if (!ok) {
   
  console.error('Server did not start.\n', serverLog);
  cleanup(1);
}

function runTest(file) {
  return new Promise((resolve) => {
    const t = spawn('node', [file], { stdio: 'inherit', env: { ...process.env, BASE } });
    t.on('exit', (code) => resolve(code ?? 1));
  });
}

let failures = 0;
for (const file of testFiles) {
   
  console.log(`\n── ${path.basename(file)} ──`);
   
  const code = await runTest(file);
  if (code !== 0) failures += 1;
}
cleanup(failures === 0 ? 0 : 1);
