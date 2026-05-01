#!/usr/bin/env bash
# Clone the UAT database into a fresh local Postgres database, then point
# dobybot/.env at it. Safe to re-run.
#
# Prerequisites (one-time, per dev):
#   1. cloud-sql-proxy alias is set up:
#        alias cloud-sql-proxy-dobybot-main="cloud-sql-proxy --port 15432 \
#          --credentials-file ~/Projects/dobybot/.gcp/dobybot-2f20c212773a.json \
#          dobybot:asia-southeast1:main-2"
#   2. Local Postgres running: (cd dev-support && docker compose up -d)
#   3. UAT password stored in ~/.pgpass (postgres-standard, never on CLI):
#        echo '*:15432:*:postgres:<UAT_PASSWORD>' >> ~/.pgpass
#        chmod 600 ~/.pgpass
#
# Per-run:
#   1. In another terminal: cloud-sql-proxy-dobybot-main
#   2. ./scripts/clone-uat-to-local.sh [target_db_name]
#
# Default target_db_name: uat_clone_YYYYMMDD

set -euo pipefail

UAT_HOST=127.0.0.1
UAT_PORT=15432
UAT_USER=postgres
UAT_DB=uat

LOCAL_HOST=127.0.0.1
LOCAL_PORT=5432
LOCAL_USER=postgres
LOCAL_PASSWORD=postgres

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORKSPACE_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
ENV_FILE="$WORKSPACE_ROOT/dobybot/.env"

TARGET_DB="${1:-uat_clone_$(date +%Y%m%d)}"

red()   { printf '\033[31m%s\033[0m\n' "$*" >&2; }
green() { printf '\033[32m%s\033[0m\n' "$*"; }
blue()  { printf '\033[34m%s\033[0m\n' "$*"; }

# --- Preflight ---

for bin in pg_dump pg_restore psql nc; do
  if ! command -v "$bin" >/dev/null; then
    red "error: '$bin' not on PATH"
    [[ "$bin" == pg_* || "$bin" == psql ]] && red "       brew install libpq && brew link --force libpq"
    exit 1
  fi
done

if ! nc -z "$UAT_HOST" "$UAT_PORT" 2>/dev/null; then
  red "error: cloud-sql-proxy not listening on $UAT_HOST:$UAT_PORT"
  red "       in another terminal, run: cloud-sql-proxy-dobybot-main"
  exit 1
fi

if ! nc -z "$LOCAL_HOST" "$LOCAL_PORT" 2>/dev/null; then
  red "error: local Postgres not running on $LOCAL_HOST:$LOCAL_PORT"
  red "       run: (cd $WORKSPACE_ROOT/dev-support && docker compose up -d)"
  exit 1
fi

if [[ ! -f "$HOME/.pgpass" ]]; then
  red "error: ~/.pgpass not found"
  red "       echo 'localhost:$UAT_PORT:*:$UAT_USER:<UAT_PASSWORD>' >> ~/.pgpass"
  red "       chmod 600 ~/.pgpass"
  exit 1
fi

PGPASS_MODE=$(stat -f '%Lp' "$HOME/.pgpass")
if [[ "$PGPASS_MODE" != "600" ]]; then
  red "error: ~/.pgpass mode is $PGPASS_MODE, must be 600. Run: chmod 600 ~/.pgpass"
  exit 1
fi

if ! grep -qE "^(localhost|\*|127\.0\.0\.1):$UAT_PORT:[^:]*:$UAT_USER:" "$HOME/.pgpass"; then
  red "error: ~/.pgpass missing entry. Add:"
  red "       *:$UAT_PORT:*:$UAT_USER:<UAT_PASSWORD>"
  exit 1
fi

if [[ ! -f "$ENV_FILE" ]]; then
  red "error: $ENV_FILE not found"
  exit 1
fi

# Verify UAT auth before doing anything destructive locally.
if ! psql -h "$UAT_HOST" -p "$UAT_PORT" -U "$UAT_USER" -d "$UAT_DB" -tAc 'SELECT 1' >/dev/null 2>&1; then
  red "error: cannot connect to UAT — check ~/.pgpass entry and that cloud-sql-proxy is running"
  exit 1
fi

# --- Confirm and (re)create target local DB ---

EXISTS=$(PGPASSWORD="$LOCAL_PASSWORD" psql -h "$LOCAL_HOST" -p "$LOCAL_PORT" -U "$LOCAL_USER" -d postgres \
  -tAc "SELECT 1 FROM pg_database WHERE datname='$TARGET_DB'")

if [[ "$EXISTS" == "1" ]]; then
  read -r -p "Local DB '$TARGET_DB' already exists. Drop and replace? [y/N] " ans
  if [[ "$ans" != "y" && "$ans" != "Y" ]]; then
    echo "aborted"
    exit 0
  fi
  PGPASSWORD="$LOCAL_PASSWORD" psql -h "$LOCAL_HOST" -p "$LOCAL_PORT" -U "$LOCAL_USER" -d postgres \
    -c "DROP DATABASE \"$TARGET_DB\"" >/dev/null
fi

PGPASSWORD="$LOCAL_PASSWORD" psql -h "$LOCAL_HOST" -p "$LOCAL_PORT" -U "$LOCAL_USER" -d postgres \
  -c "CREATE DATABASE \"$TARGET_DB\"" >/dev/null

# --- Dump from UAT, restore to local (parallel, directory format) ---

DUMP_DIR=$(mktemp -d -t uat_clone.XXXXXX)
trap 'rm -rf "$DUMP_DIR"' EXIT

blue "==> dumping $UAT_DB from UAT (read-only)"
pg_dump \
  -h "$UAT_HOST" -p "$UAT_PORT" -U "$UAT_USER" -d "$UAT_DB" \
  -Fd -j 4 -Z 6 --no-owner --no-privileges \
  -f "$DUMP_DIR"

blue "==> restoring into local '$TARGET_DB'"
RESTORE_LOG="$DUMP_DIR/pg_restore.log"
set +e
PGPASSWORD="$LOCAL_PASSWORD" pg_restore \
  -h "$LOCAL_HOST" -p "$LOCAL_PORT" -U "$LOCAL_USER" -d "$TARGET_DB" \
  -j 4 --no-owner --no-privileges \
  "$DUMP_DIR" 2> >(tee "$RESTORE_LOG" >&2)
RESTORE_RC=$?
set -e

# pg_restore exits non-zero on benign Cloud-SQL-only objects (cloudsqladmin
# grants, google_* extensions). Distinguish those from fatal failures
# (disk full, server crash, worker died) — the latter must abort before we
# rewrite .env to point at an incomplete DB.
if [[ $RESTORE_RC -ne 0 ]]; then
  if grep -qE 'No space left on device|server closed the connection unexpectedly|worker process died|PANIC:|terminating connection|could not connect to server' "$RESTORE_LOG"; then
    red "error: pg_restore failed fatally — local '$TARGET_DB' is incomplete."
    red "       inspect the errors above; .env was NOT modified."
    red "       drop the partial DB with:"
    red "         psql -h $LOCAL_HOST -p $LOCAL_PORT -U $LOCAL_USER -d postgres -c 'DROP DATABASE \"$TARGET_DB\"'"
    exit 1
  fi
  red "note: pg_restore reported non-fatal errors above (likely Cloud-SQL-only objects)."
fi

# --- Update dobybot/.env ---

BACKUP="$ENV_FILE.bak.$(date +%Y%m%d-%H%M%S)"
cp "$ENV_FILE" "$BACKUP"

NEW_URL="postgres://$LOCAL_USER:$LOCAL_PASSWORD@$LOCAL_HOST/$TARGET_DB"

# Comment out any active DATABASE_URL=... line, then append the new one.
sed -i.tmp 's/^DATABASE_URL=/# DATABASE_URL=/' "$ENV_FILE"
rm -f "$ENV_FILE.tmp"
printf '\nDATABASE_URL=%s\n' "$NEW_URL" >> "$ENV_FILE"

green "==> done"
echo "    local DB:       $TARGET_DB"
echo "    DATABASE_URL:   $NEW_URL"
echo "    .env backup:    $BACKUP"
