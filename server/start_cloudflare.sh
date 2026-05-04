#!/bin/sh
set -eu

APP_DIR="/app"
ENV_FILE="${APP_DIR}/.env"

if [ -n "${MAGICART_SERVER_ENV_B64:-}" ]; then
  python - <<'PY'
import base64
import os
from pathlib import Path

payload = os.environ.get("MAGICART_SERVER_ENV_B64", "")
if payload:
    env_text = base64.b64decode(payload).decode("utf-8")
    path = Path("/app/.env")
    path.write_text(env_text, encoding="utf-8")
    path.chmod(0o600)
PY
fi

exec uvicorn main:socket_app --host 0.0.0.0 --port "${PORT:-8000}"
