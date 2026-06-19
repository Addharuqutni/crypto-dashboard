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

if [ ! -f .env.local ]; then
  cp deploy/vps.env.example .env.local
  echo "Created .env.local from deploy/vps.env.example. Edit secrets before exposing publicly." >&2
fi

npm ci
npm run check
npm run build
npm run screener -- --once

if command -v pm2 >/dev/null 2>&1; then
  pm2 startOrReload ecosystem.config.cjs --update-env
  pm2 save
  echo "PM2 processes started/reloaded."
else
  echo "PM2 not found. Install with: npm install -g pm2" >&2
  echo "Then run: pm2 startOrReload ecosystem.config.cjs --update-env && pm2 save" >&2
fi
