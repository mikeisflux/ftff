#!/usr/bin/env bash
# ============================================================================
# One-time server provisioning for the Convention Platform (Ubuntu 22.04/24.04).
# Installs Node 26, PM2, nginx, Postgres 18 + client, and app dependencies.
# Run as a sudo-capable user from the repo root:  sudo bash infra/deploy/setup.sh
# Idempotent-ish: safe to re-run.
# ============================================================================
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
echo "Repo: $REPO_DIR"

echo "== apt packages =="
apt-get update -y
apt-get install -y curl ca-certificates gnupg git build-essential ufw iptables

echo "== Node.js 26 (NodeSource) =="
if ! node -v 2>/dev/null | grep -q '^v26'; then
  curl -fsSL https://deb.nodesource.com/setup_26.x | bash -
  apt-get install -y nodejs
fi
node -v && npm -v

echo "== PM2 =="
npm install -g pm2
pm2 -v

echo "== nginx =="
apt-get install -y nginx
systemctl enable --now nginx

echo "== PostgreSQL 18 (PGDG) =="
if ! command -v psql >/dev/null 2>&1 || ! psql --version | grep -q ' 18'; then
  install -d /usr/share/postgresql-common/pgdg
  curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc \
    | gpg --dearmor -o /usr/share/keyrings/pgdg.gpg
  echo "deb [signed-by=/usr/share/keyrings/pgdg.gpg] http://apt.postgresql.org/pub/repos/apt $(. /etc/os-release; echo "$VERSION_CODENAME")-pgdg main" \
    > /etc/apt/sources.list.d/pgdg.list
  apt-get update -y
  apt-get install -y postgresql-18 postgresql-client-18
  systemctl enable --now postgresql
fi
psql --version

echo "== certbot (TLS) =="
apt-get install -y certbot python3-certbot-nginx

echo "== app dependencies + build =="
cd "$REPO_DIR"
npm ci
npm run build --workspace client

echo
echo "✅ Provisioning complete. Next: create the database + /etc/convention.env,"
echo "   run migrations, start PM2, and configure nginx (see infra/deploy/DEPLOY.md)."
