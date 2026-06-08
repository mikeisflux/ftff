// Self-contained E2E runner: boots the API, waits for health, runs the
// checkout-flow assertions, then tears the server down. Usage: npm run test:e2e
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const serverEntry = path.resolve(here, '../src/index.js');
const flowTest = path.resolve(here, './checkout-flow.test.mjs');
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
  // eslint-disable-next-line no-console
  console.error('Server did not start.\n', serverLog);
  cleanup(1);
}

const test = spawn('node', [flowTest], { stdio: 'inherit', env: { ...process.env, BASE } });
test.on('exit', (code) => cleanup(code ?? 1));
