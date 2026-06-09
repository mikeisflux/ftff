#!/usr/bin/env bash
# Encrypted Postgres backup (§4.3). Writes a gzipped, AES-256 encrypted dump.
# Schedule via cron/systemd-timer. Requires: pg_dump, gzip, openssl.
#
#   DATABASE_URL=postgres://...  BACKUP_KEY=<passphrase>  ./infra/backup.sh
#
set -euo pipefail

: "${DATABASE_URL:?set DATABASE_URL}"
: "${BACKUP_KEY:?set BACKUP_KEY (encryption passphrase)}"
BACKUP_DIR="${BACKUP_DIR:-./backups}"
mkdir -p "$BACKUP_DIR"

stamp="$(date -u +%Y%m%dT%H%M%SZ)"
out="$BACKUP_DIR/backup-$stamp.sql.gz.enc"

pg_dump "$DATABASE_URL" \
  | gzip -9 \
  | openssl enc -aes-256-cbc -salt -pbkdf2 -pass env:BACKUP_KEY \
  > "$out"

echo "Wrote $out ($(du -h "$out" | cut -f1))"

# Retention: keep the most recent 168 (≈1 week of hourly) backups.
ls -1t "$BACKUP_DIR"/backup-*.sql.gz.enc 2>/dev/null | tail -n +169 | xargs -r rm --
