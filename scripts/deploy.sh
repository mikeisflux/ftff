#!/usr/bin/env bash
# Reliable production deploy for the Convention Platform — with automatic backup
# and rollback.
#
#   bash scripts/deploy.sh            # backup, deploy, health-check, auto-rollback on failure
#   bash scripts/deploy.sh rollback   # manually restore the most recent backup
#   bash scripts/deploy.sh rollback .deploy-backups/20260627-101500  # a specific one
#
# Before touching anything we snapshot: the current git commit, the built
# frontend bundle (client/dist), and a full database dump. If any deploy step
# fails — or the post-deploy health check fails — we restore that snapshot and
# reload, so the live site falls back to the last known-good release.
#
# Note on prod: NODE_ENV=production makes `npm install` skip devDependencies, so
# we force them in for the vite build (else the build silently no-ops).
set -euo pipefail

cd "$(dirname "$0")/.."
ROOT="$(pwd)"
BRANCH="$(git rev-parse --abbrev-ref HEAD)"
ENV_FILE="${CONVENTION_ENV_FILE:-/etc/convention.env}"
BACKUP_ROOT="${CONVENTION_BACKUP_DIR:-$ROOT/.deploy-backups}"
KEEP_BACKUPS="${CONVENTION_KEEP_BACKUPS:-5}"
APP="convention-api"

load_env() {
  if [[ -f "$ENV_FILE" ]]; then
    set -a; # shellcheck disable=SC1090
    . "$ENV_FILE"; set +a
  else
    echo "  ! $ENV_FILE not found — DB/health steps may be limited." >&2
  fi
}

reload_app() { pm2 reload "$ROOT/ecosystem.config.cjs" || pm2 restart "$APP" || true; }

# Poll the running API until it answers (or give up). Used to verify a deploy.
health_check() {
  local url="${HEALTHCHECK_URL:-http://127.0.0.1:${PORT:-4000}/api/v1/public-config}"
  local i
  for i in $(seq 1 10); do
    if curl -fsS --max-time 5 "$url" >/dev/null 2>&1; then return 0; fi
    sleep 2
  done
  return 1
}

# Restore code + frontend bundle + database from a backup directory.
restore_backup() {
  local dir="${1%/}"
  [[ -d "$dir" ]] || { echo "  ! backup dir not found: $dir" >&2; return 1; }
  echo "↩  Restoring release from $dir"
  if [[ -f "$dir/commit.txt" ]]; then
    git reset --hard "$(cat "$dir/commit.txt")" || true
  fi
  if [[ -f "$dir/dist.tar.gz" ]]; then
    rm -rf client/dist && mkdir -p client/dist
    tar -xzf "$dir/dist.tar.gz" -C client/dist
  fi
  if [[ -f "$dir/db.sql" && -n "${DATABASE_URL:-}" ]] && command -v psql >/dev/null 2>&1; then
    echo "   restoring database…"
    psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q -f "$dir/db.sql" || echo "  ! DB restore reported errors" >&2
  fi
  reload_app
  echo "✓ Rolled back to the previous release."
}

latest_backup() { ls -1dt "$BACKUP_ROOT"/*/ 2>/dev/null | head -1; }

# ── rollback subcommand ──────────────────────────────────────────────────────
if [[ "${1:-}" == "rollback" ]]; then
  load_env
  TARGET="${2:-$(latest_backup)}"
  [[ -n "$TARGET" ]] || { echo "No backups found in $BACKUP_ROOT" >&2; exit 1; }
  restore_backup "$TARGET"
  exit 0
fi

# ── normal deploy ────────────────────────────────────────────────────────────
load_env

STAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP_DIR="$BACKUP_ROOT/$STAMP"
mkdir -p "$BACKUP_DIR"

echo "→ [1/7] Backing up current release to $BACKUP_DIR"
git rev-parse HEAD > "$BACKUP_DIR/commit.txt"
[[ -d client/dist ]] && tar -czf "$BACKUP_DIR/dist.tar.gz" -C client/dist .
if [[ -n "${DATABASE_URL:-}" ]] && command -v pg_dump >/dev/null 2>&1; then
  echo "   dumping database…"
  pg_dump --clean --if-exists "$DATABASE_URL" > "$BACKUP_DIR/db.sql" \
    || echo "  ! pg_dump failed — continuing WITHOUT a DB backup." >&2
else
  echo "  ! pg_dump unavailable or DATABASE_URL unset — skipping DB backup." >&2
fi

# From here on, any failure restores the snapshot we just took.
rollback_on_err() { echo "✗ Deploy step failed — rolling back."; trap - ERR; restore_backup "$BACKUP_DIR"; exit 1; }
trap rollback_on_err ERR

echo "→ [2/7] Pulling latest on $BRANCH"
git pull origin "$BRANCH"

echo "→ [3/7] Installing dependencies (including dev — needed for the vite build)"
npm install --include=dev

echo "→ [4/7] Building the frontend"
npm run build

echo "→ [5/7] Migrating the database (schema + idempotent migrations)"
npm run db:migrate
# Only seed a FRESH database. On an existing one we NEVER re-run seed.sql, so
# admin-managed content (nav, floor plan, pages, etc.) is never overwritten.
# db:migrate above already applied all idempotent, guarded migrations.
SEED_ROWS="skip"
if [[ -n "${DATABASE_URL:-}" ]] && command -v psql >/dev/null 2>&1; then
  SEED_ROWS="$(psql "$DATABASE_URL" -tAc 'SELECT count(*) FROM settings' 2>/dev/null | tr -d '[:space:]')"
fi
if [[ "$SEED_ROWS" == "0" ]]; then
  echo "   fresh database — running full seed"
  npm run db:seed
else
  echo "   existing database (settings rows: ${SEED_ROWS:-unknown}) — skipping seed to preserve your content"
fi

echo "→ [6/7] Reloading the app"
reload_app

echo "→ [7/7] Health check"
if ! health_check; then
  echo "  ! health check failed after reload."
  rollback_on_err
fi
trap - ERR

# Prune old backups (keep the newest $KEEP_BACKUPS).
ls -1dt "$BACKUP_ROOT"/*/ 2>/dev/null | tail -n +$((KEEP_BACKUPS + 1)) | xargs -r rm -rf

echo "✓ Deployed $(git -C "$ROOT" log --oneline -1)"
echo "  Frontend bundle now: $(ls -t client/dist/assets/*.js | head -1)"
echo "  Backup kept at: $BACKUP_DIR"
echo "  Roll back anytime with:  bash scripts/deploy.sh rollback"
