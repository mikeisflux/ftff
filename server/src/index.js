import { createApp } from './app.js';
import { env } from './config/env.js';
import { pool } from './db/pool.js';

const app = createApp();
const server = app.listen(env.PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`🚀 API listening on ${env.PUBLIC_URL} (port ${env.PORT}, ${env.NODE_ENV})`);
});

async function shutdown(signal) {
  // eslint-disable-next-line no-console
  console.log(`\n${signal} received — shutting down…`);
  server.close(async () => {
    await pool.end().catch(() => {});
    process.exit(0);
  });
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
