// PM2 process configuration. Run with:  pm2 start ecosystem.config.cjs
//
// Production secrets are loaded from an env file (default /etc/convention.env,
// override with CONVENTION_ENV_FILE) so `pm2 start` needs no manual sourcing.
// In local dev, the app falls back to ./.env via dotenv.
//
// The API runs in fork mode with a single instance because background
// singletons live in-process (booth-hold release, BotBlock cache refresh, the
// chat WebSocket fan-out). To scale horizontally, move those to a shared
// queue/pub-sub and switch exec_mode to "cluster".
//
// The BotBlock *watcher* and *sync* are NOT managed here — they require root for
// iptables and run as a systemd service + cron (see infra/botblock-firewall and
// infra/RUNBOOK.md).
const fs = require('fs');

const ENV_FILE = process.env.CONVENTION_ENV_FILE || '/etc/convention.env';
let fileEnv = {};
try {
  if (fs.existsSync(ENV_FILE)) {
    // dotenv is a server dependency (hoisted to the root node_modules).
    fileEnv = require('dotenv').parse(fs.readFileSync(ENV_FILE));
  }
} catch (e) {
  // eslint-disable-next-line no-console
  console.error('Could not read env file', ENV_FILE, e.message);
}

module.exports = {
  apps: [
    {
      name: 'convention-api',
      cwd: __dirname,
      script: 'server/src/index.js',
      exec_mode: 'fork',
      instances: 1,
      autorestart: true,
      max_restarts: 10,
      max_memory_restart: '512M',
      kill_timeout: 8000, // allow graceful SIGTERM shutdown (drains the server)
      env: {
        NODE_ENV: 'production',
        ...fileEnv,
      },
      out_file: 'logs/api.out.log',
      error_file: 'logs/api.err.log',
      time: true,
    },
  ],
};
