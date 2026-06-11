#!/usr/bin/env bash
# Reliable production deploy for the Convention Platform.
#
#   bash scripts/deploy.sh
#
# Fixes the classic foot-gun: when NODE_ENV=production is in the environment
# (it is, via /etc/convention.env), `npm install` SKIPS devDependencies — so
# vite isn't installed and `npm run build` fails with "vite: not found",
# silently leaving the old compiled bundle in client/dist. We force dev deps in
# for the build step, then build, migrate, seed, and reload.
set -euo pipefail

cd "$(dirname "$0")/.."
ROOT="$(pwd)"
BRANCH="$(git rev-parse --abbrev-ref HEAD)"
ENV_FILE="${CONVENTION_ENV_FILE:-/etc/convention.env}"

echo "→ [1/6] Pulling latest on $BRANCH"
git pull origin "$BRANCH"

echo "→ [2/6] Installing dependencies (including dev — needed for the vite build)"
npm install --include=dev

echo "→ [3/6] Building the frontend"
npm run build

echo "→ [4/6] Loading env from $ENV_FILE"
if [[ -f "$ENV_FILE" ]]; then
  set -a; # shellcheck disable=SC1090
  . "$ENV_FILE"; set +a
else
  echo "  ! $ENV_FILE not found — DB steps will fail without DATABASE_URL etc." >&2
fi

echo "→ [5/6] Migrating + seeding the database"
npm run db:migrate
npm run db:seed

echo "→ [6/6] Reloading the app"
pm2 reload ecosystem.config.cjs

echo "✓ Deployed $(git -C "$ROOT" log --oneline -1)"
echo "  Frontend bundle now: $(ls -t client/dist/assets/*.js | head -1)"
