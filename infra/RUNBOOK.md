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
