#!/bin/sh
set -eu

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname "$0")" && pwd)"
SERVER_DIR="$(CDPATH= cd -- "${SCRIPT_DIR}/.." && pwd)"

DB_NAME="${1:-}"
if [ -z "$DB_NAME" ]; then
  echo "Usage: $0 <d1-database-name>" >&2
  exit 1
fi

echo "Applying D1 schema..."
npx wrangler d1 execute "$DB_NAME" --remote --file "${SERVER_DIR}/migrations/d1_supabase_schema.sql"
