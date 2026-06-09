#!/usr/bin/env bash
# Restore an encrypted backup produced by backup.sh into a target database.
# ALWAYS test-restore into a scratch DB first — never straight into production.
#
#   BACKUP_KEY=<passphrase> ./infra/restore.sh backup-XXXX.sql.gz.enc convention_restore_test
#
set -euo pipefail

: "${BACKUP_KEY:?set BACKUP_KEY (decryption passphrase)}"
file="${1:?usage: restore.sh <backup-file.enc> <target-db>}"
target="${2:?usage: restore.sh <backup-file.enc> <target-db>}"
PGHOST="${PGHOST:-localhost}"

echo "Restoring $file -> database '$target' on $PGHOST"
createdb -h "$PGHOST" "$target" 2>/dev/null || true

openssl enc -d -aes-256-cbc -pbkdf2 -pass env:BACKUP_KEY -in "$file" \
  | gunzip \
  | psql -h "$PGHOST" -d "$target"

echo "Restore complete. Verify row counts before promoting."
