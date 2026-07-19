#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
cd "$APP_DIR"

if ! command -v node >/dev/null 2>&1; then
  echo "node is required" >&2
  exit 1
fi

NODE_MAJOR="$(node -p "process.versions.node.split('.')[0]")"
if [ "$NODE_MAJOR" -lt 22 ]; then
  echo "Node.js >=22 is required. Current: $(node -v)" >&2
  exit 1
fi

mkdir -p logs data/screener data/worker

# Single unified env for Next.js + Python Action Call agent.
if [ ! -f .env.local ]; then
  cp .env.example .env.local
  echo "Created .env.local from .env.example. Edit secrets before exposing publicly." >&2
fi

# Production defaults when keys are missing from an older .env.local
ensure_env() {
  local key="$1"
  local value="$2"
  if ! grep -q "^${key}=" .env.local 2>/dev/null; then
    echo "${key}=${value}" >> .env.local
  fi
}
ensure_env "NODE_ENV" "production"
ensure_env "PORT" "3000"
ensure_env "HOSTNAME" "127.0.0.1"
ensure_env "DISABLE_SCREENER_SCHEDULER" "1"
ensure_env "SCREENER_STORAGE_MODE" "file"
ensure_env "SCREENER_STORAGE_BACKEND" "file"
ensure_env "SCREENER_REQUIRE_DATABASE" "0"
ensure_env "SCREENER_FILE_MODE_STRICT" "1"
ensure_env "PYTHON_AGENT_URL" "http://127.0.0.1:8000"
ensure_env "PYTHON_AGENT_TIMEOUT_MS" "20000"
ensure_env "MARKET_DATA_MODE" "dashboard"
ensure_env "DASHBOARD_HOST" "127.0.0.1"
ensure_env "DASHBOARD_PORT" "8000"

npm ci
npm run check
npm run build
npm run screener -- --once

if [ -d "agent" ]; then
  echo "Setting up Python Action Call agent..."
  if [ ! -d "agent/.venv" ]; then
    python3 -m venv agent/.venv
  fi
  agent/.venv/bin/pip install --upgrade pip
  agent/.venv/bin/pip install -r agent/requirements.txt
  chmod +x scripts/python-agent/start.sh 2>/dev/null || true
fi

if command -v pm2 >/dev/null 2>&1; then
  pm2 startOrReload ecosystem.config.cjs --update-env
  pm2 save
  echo "PM2 processes started/reloaded (web, screener, worker, python-agent)."
else
  echo "PM2 not found. Install with: npm install -g pm2" >&2
  echo "Then run: pm2 startOrReload ecosystem.config.cjs --update-env && pm2 save" >&2
fi
