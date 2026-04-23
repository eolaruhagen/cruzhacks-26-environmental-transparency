#!/usr/bin/env bash

# Pulls all rows from the prod house_bills table, writes them as a replayable
# SQL dump to seeds/resets/prod_house_bills.sql, then truncates and reloads
# the local house_bills table from that dump.

set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel)"
ENV_FILE="$REPO_ROOT/.env"
RESET_FILE="$REPO_ROOT/supabase/seeds/resets/prod_house_bills.sql"

if [[ ! -f "$ENV_FILE" ]]; then
    echo "Error: $ENV_FILE not found" >&2
    exit 1
fi

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

PROD_URL="${PROD_DATABASE_URL:?PROD_DATABASE_URL not set in .env}"
LOCAL_URL="${DB_URL:?DB_URL not set in .env}"

mkdir -p "$(dirname "$RESET_FILE")"

echo "→ Refreshing local public.house_bills from prod..."

echo "  · Dumping prod into $RESET_FILE..."
supabase db dump --db-url "$PROD_URL" --data-only --schema public -f "$RESET_FILE" -- --table=public.house_bills

echo "  · Truncating local table..."
psql "$LOCAL_URL" -c "TRUNCATE public.house_bills RESTART IDENTITY;"

echo "  · Loading dump into local..."
psql "$LOCAL_URL" -f "$RESET_FILE"

echo "✓ Done. Local row count:"
psql "$LOCAL_URL" -tAc "SELECT count(*) FROM public.house_bills;"
