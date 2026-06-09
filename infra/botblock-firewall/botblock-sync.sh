#!/bin/bash
# ============================================================================
# botblock-sync.sh
#
# Full reconciliation script: reads blocked IPs from a PostgreSQL database
# and syncs them with iptables. Adds missing rules, removes expired ones.
#
# This is the safety net. The watcher handles instant blocking; this script
# ensures everything stays in sync even if the watcher misses something.
#
# Usage:
#   sudo bash botblock-sync.sh
#
# Cron (every 5 minutes):
#   */5 * * * * /usr/local/bin/botblock-sync >> /var/log/botblock.log 2>&1
# ============================================================================

set -euo pipefail

# ---- Configuration (from environment; falls back to local defaults) ----
# Set these in /etc/botblock.env (loaded via systemd EnvironmentFile) or export
# before running. They mirror the app's Postgres connection.
CHAIN="${BOTBLOCK_CHAIN:-BOTBLOCK}"
DB_HOST="${PGHOST:-localhost}"
DB_USER="${PGUSER:-postgres}"
DB_PASS="${PGPASSWORD:-postgres}"
DB_NAME="${PGDATABASE:-convention}"
LOG_PREFIX="[BotBlock-Sync]"

# ---- Functions ----

log() {
  echo "$(date -u '+%Y-%m-%dT%H:%M:%SZ') $LOG_PREFIX $*"
}

# ---- Startup checks ----

if [ "$(id -u)" -ne 0 ]; then
  echo "$LOG_PREFIX Error: must run as root" >&2
  exit 1
fi

# ---- 1. Ensure the BOTBLOCK chain exists and is hooked into INPUT ----

if ! iptables -n -L "$CHAIN" >/dev/null 2>&1; then
  log "Creating chain $CHAIN"
  iptables -N "$CHAIN"
fi

if ! iptables -C INPUT -j "$CHAIN" 2>/dev/null; then
  log "Adding jump from INPUT to $CHAIN"
  iptables -I INPUT -j "$CHAIN"
fi

# ---- 2. Get currently blocked IPs from the database ----

DB_IPS=$(PGPASSWORD="$DB_PASS" psql -h "$DB_HOST" -U "$DB_USER" -d "$DB_NAME" -t -A -c \
  "SELECT \"ipAddress\" FROM \"BlockedIP\" WHERE \"expiresAt\" > NOW();" 2>/dev/null) || {
  log "Error: failed to query database"
  exit 1
}

# Build a set of IPs that should be blocked
declare -A DB_IP_SET
while IFS= read -r ip; do
  [ -z "$ip" ] && continue
  if [[ "$ip" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
    DB_IP_SET["$ip"]=1
  fi
done <<< "$DB_IPS"

# ---- 3. Get IPs currently in the BOTBLOCK chain ----

declare -A FW_IP_SET
while IFS= read -r line; do
  ip=$(echo "$line" | grep -oP '(?<=-s )[0-9.]+(?=/32)' 2>/dev/null) || continue
  [ -z "$ip" ] && continue
  FW_IP_SET["$ip"]=1
done < <(iptables -S "$CHAIN" 2>/dev/null)

# ---- 4. Add missing rules ----

added=0
for ip in "${!DB_IP_SET[@]}"; do
  if [ -z "${FW_IP_SET[$ip]+x}" ]; then
    iptables -A "$CHAIN" -s "$ip/32" -j DROP
    log "ADDED $ip"
    ((added++))
  fi
done

# ---- 5. Remove expired rules (in firewall but not in DB) ----

removed=0
for ip in "${!FW_IP_SET[@]}"; do
  if [ -z "${DB_IP_SET[$ip]+x}" ]; then
    iptables -D "$CHAIN" -s "$ip/32" -j DROP 2>/dev/null || true
    log "REMOVED $ip (expired)"
    ((removed++))
  fi
done

# ---- 6. Clean up very old expired rows ----

PGPASSWORD="$DB_PASS" psql -h "$DB_HOST" -U "$DB_USER" -d "$DB_NAME" -c \
  "DELETE FROM \"BlockedIP\" WHERE \"expiresAt\" < NOW() - INTERVAL '7 days';" >/dev/null 2>&1 || true

# ---- 7. Summary ----

total=${#DB_IP_SET[@]}
if [ "$added" -gt 0 ] || [ "$removed" -gt 0 ]; then
  log "Sync complete: $total active blocks, +$added added, -$removed removed"
elif [ "$total" -gt 0 ]; then
  log "Sync complete: $total active blocks (no changes)"
fi
