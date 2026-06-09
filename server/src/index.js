import { createApp } from './app.js';
import { env } from './config/env.js';
import { pool } from './db/pool.js';
import { startHoldReleaseJob } from './jobs/releaseHolds.js';
import { startExhibitorJobs } from './jobs/exhibitorJobs.js';
import { startBotblock } from './lib/botblock.js';
import { attachChat } from './lib/chat.js';

const app = createApp();
const server = app.listen(env.PORT, () => {

  console.log(`🚀 API listening on ${env.PUBLIC_URL} (port ${env.PORT}, ${env.NODE_ENV})`);
});

// Background: release expired booth holds (§9) + refresh the BotBlock cache.
startHoldReleaseJob();
startExhibitorJobs();
startBotblock();
// Virtual Con live chat over WebSocket (§11).
attachChat(server);

async function shutdown(signal) {
   
  console.log(`\n${signal} received — shutting down…`);
  server.close(async () => {
    await pool.end().catch(() => {});
    process.exit(0);
  });
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
