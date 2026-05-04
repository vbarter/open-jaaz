#!/bin/sh
set -eu

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname "$0")" && pwd)"
ENV_FILE="${1:-${SCRIPT_DIR}/.env.cloudflare}"

if [ ! -f "$ENV_FILE" ]; then
  echo "Missing env file: $ENV_FILE" >&2
  echo "Copy .env.cloudflare.example to .env.cloudflare and fill in real values." >&2
  exit 1
fi

if ! command -v base64 >/dev/null 2>&1; then
  echo "base64 command is required" >&2
  exit 1
fi

echo "Installing worker dependencies..."
npm install

echo "Uploading MAGICART_SERVER_ENV_B64 worker secret..."
base64 < "$ENV_FILE" | tr -d '\n' | npx wrangler secret put MAGICART_SERVER_ENV_B64

echo "Deploying Cloudflare Worker + Container..."
npx wrangler deploy
