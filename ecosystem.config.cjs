// PM2 process configuration. Run with:  pm2 start ecosystem.config.cjs
//
// The API runs in fork mode with a single instance because two background
// singletons live in-process (the booth-hold release job and the BotBlock cache
// refresher). To scale horizontally, move those to a shared queue/cron and
// switch exec_mode to "cluster".
//
// The BotBlock *watcher* and *sync* are NOT managed here — they require root for
// iptables and run as a systemd service + cron (see infra/botblock-firewall and
// infra/RUNBOOK.md).
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
      },
      // Secrets come from the real environment / secret manager, not from here.
      // Logs (PM2 captures stdout/stderr):
      out_file: 'logs/api.out.log',
      error_file: 'logs/api.err.log',
      time: true,
    },
  ],
};
