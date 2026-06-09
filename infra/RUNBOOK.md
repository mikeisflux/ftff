# Operations Runbook

## Stack
- Node.js **26.3.0**, React **19.2.7**, PostgreSQL **18.4** (schema works on 16+).
- Monorepo: `/client` (Vite SPA), `/server` (Express API + jobs), `/server/db`.

## Environment (§16)
Set these in your secret manager / platform env — never commit them:

| Var | Purpose |
|---|---|
| `DATABASE_URL` | Postgres connection string |
| `JWT_SECRET` | signs access tokens (≥32 chars) |
| `SETTINGS_MASTER_KEY` | 32-byte hex; AES-256-GCM key for secret settings |
| `CLIENT_ORIGIN`, `PUBLIC_URL` | public origins (CORS, links, QR) |
| `NODE_ENV=production` | enables HSTS, TLS DB, opaque errors |
| `OBJECT_STORAGE_*` | R2/S3 for uploads (CDN-served) |

Third-party keys (Stripe, SendGrid, Cloudflare, Maps, reCAPTCHA) are entered in
the admin **Settings** panel and stored encrypted — not in env.

## First deploy
```bash
npm ci
npm run db:migrate            # schema.sql (idempotent)
npm run db:seed               # seed.sql (idempotent)
npm run db:seed:admin -w server   # create the first admin (interactive)
npm run build -w client       # static SPA -> client/dist (serve via CDN)
NODE_ENV=production node server/src/index.js
```
Then in `/admin/settings`, enter Stripe, SendGrid, Cloudflare, Maps, reCAPTCHA
keys. Configure:
- **Stripe** webhook → `https://<host>/api/v1/webhooks/stripe` (paste the signing
  secret into settings).
- **SendGrid** Inbound Parse → `https://<host>/api/v1/webhooks/sendgrid-inbound?token=<inbound secret>`.
- **Cloudflare Stream** → create a live input from `/admin/stream`; give the RTMPS
  URL + key to the production encoder.

## Backups & restore
Automated encrypted backups and a **tested** restore (see `backup.sh` /
`restore.sh`). Schedule `backup.sh` via cron/systemd-timer (e.g. hourly).
Test restores into a scratch database monthly:
```bash
./infra/backup.sh                       # writes encrypted dump to $BACKUP_DIR
./infra/restore.sh backup-YYYYMMDD.sql.gz.enc convention_restore_test
```

## Running with PM2
The API runs under PM2 in **fork mode, 1 instance** (two in-process singletons —
the booth-hold release job and the BotBlock cache refresher — must not be
duplicated; to scale out, move them to a shared queue/cron and switch to cluster).
```bash
npm ci && npm run build -w client
pm2 start ecosystem.config.cjs       # or: npm run pm2:start
pm2 save && pm2 startup              # persist across reboots
pm2 reload ecosystem.config.cjs      # zero-downtime redeploy (npm run pm2:reload)
```
Secrets come from the real environment/secret manager, not the ecosystem file.

## Superuser accounts
Admin login is **email + password only** (argon2id) — no magic links. Seed the
platform superusers (emails fixed in the script; password from env so it never
enters git):
```bash
SUPERUSER_PASSWORD='…' npm run db:seed:superusers -w server
```
Accounts: `forthefansfest@gmail.com`, `divinitycomicsinc@gmail.com` (both admin).
Re-running rotates their password to the provided value.

## BotBlock firewall (infra/botblock-firewall)
App detects bots (failed reCAPTCHA, credential-stuffing, scanner probes) and,
past a threshold, writes the IP to `BlockedIP` + `/tmp/botblock-pending`. A root
watcher applies kernel `iptables DROP` rules; a cron reconciles DB ↔ firewall.
```bash
# one-time install (root):
sudo cp infra/botblock-firewall/botblock-watcher.sh   /usr/local/bin/botblock-watcher
sudo cp infra/botblock-firewall/botblock-manual.sh    /usr/local/bin/botblock-manual
sudo cp infra/botblock-firewall/botblock-sync.sh      /usr/local/bin/botblock-sync
sudo chmod +x /usr/local/bin/botblock-*
sudo cp infra/botblock-firewall/botblock-watcher.service /etc/systemd/system/
sudo systemctl enable --now botblock-watcher           # applies DROP rules within ~5s
# reconcile every 5 min (reads the app's Postgres via PG* env in /etc/botblock.env):
echo '*/5 * * * * root PGHOST=localhost PGUSER=… PGPASSWORD=… PGDATABASE=convention /usr/local/bin/botblock-sync >> /var/log/botblock.log 2>&1' | sudo tee /etc/cron.d/botblock
# manual control:
sudo botblock-manual list | block <IP> | unblock <IP> | count | flush
```
The `BlockedIP` / `SuspiciousActivity` tables are created by `db:migrate`. Tunables:
`BOTBLOCK_THRESHOLD`, `BOTBLOCK_WINDOW_MINUTES`, `BOTBLOCK_TTL_HOURS`,
`BOTBLOCK_PENDING_FILE`, `BOTBLOCK_ENABLED`. Loopback/private IPs are never blocked.
The app-layer guard also 403s blocked IPs even where iptables isn't available.

## Routine ops
- **Health:** `GET /api/v1/health`.
- **Booth holds:** released automatically every 60s (in-process job).
- **Logs:** structured to stdout; no secrets or card data are ever logged.
- **Scaling:** the hold-release job is in-process — run it on exactly one
  instance, or move it to a queue (BullMQ/pg-boss) when scaling out.

## Incident response
1. Rotate the affected secret in **Settings** (re-encrypts at rest) or env.
2. If sessions are suspect: rotate `JWT_SECRET` (invalidates all access tokens)
   and revoke refresh tokens (`UPDATE refresh_tokens SET revoked_at=now()`).
3. Review the `audit_log` for the actor/time window.
4. Restore from the latest good backup if data integrity is in question.
