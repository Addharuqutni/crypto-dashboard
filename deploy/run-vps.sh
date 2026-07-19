#!/usr/bin/env bash
# One-shot VPS bring-up: deps check, env, deploy, optional domain.
#
# Usage (from repo root):
#   bash deploy/run-vps.sh
#   DOMAIN=example.com TLS_EMAIL=you@example.com bash deploy/run-vps.sh
#   bash deploy/run-vps.sh --domain example.com --tls you@example.com
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${APP_DIR}"

DOMAIN="${DOMAIN:-}"
TLS_EMAIL="${TLS_EMAIL:-}"
SKIP_CHECKS=0
SKIP_DOMAIN=0

while [ $# -gt 0 ]; do
  case "$1" in
    --domain) DOMAIN="${2:-}"; shift 2 ;;
    --tls) TLS_EMAIL="${2:-}"; shift 2 ;;
    --skip-checks) SKIP_CHECKS=1; shift ;;
    --skip-domain) SKIP_DOMAIN=1; shift ;;
    -h|--help)
      cat <<'EOF'
Usage: bash deploy/run-vps.sh [options]

Options:
  --domain example.com     Configure nginx for this domain after deploy
  --tls you@example.com    Also request Let's Encrypt cert (requires --domain)
  --skip-checks            Skip npm run check during deploy
  --skip-domain            Never run domain setup even if DOMAIN is set

Env:
  DOMAIN / TLS_EMAIL       Same as --domain / --tls
  APP_DIR                  Override app path (default: repo root)
EOF
      exit 0
      ;;
    *) echo "Unknown option: $1" >&2; exit 1 ;;
  esac
done

echo "==> crypto-dashboard VPS run"
echo "    app: ${APP_DIR}"

# --- system tools ---
need() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required tool: $1" >&2
    exit 1
  fi
}

need node
need npm

NODE_MAJOR="$(node -p "process.versions.node.split('.')[0]")"
if [ "${NODE_MAJOR}" -lt 22 ]; then
  echo "Node.js >=22 required (have $(node -v))" >&2
  exit 1
fi

if ! command -v pm2 >/dev/null 2>&1; then
  echo "==> installing PM2 globally"
  npm install -g pm2
fi

if ! command -v python3 >/dev/null 2>&1; then
  echo "python3 is required for the Action Call agent" >&2
  exit 1
fi

mkdir -p logs data/screener data/worker agent/datasets

# --- env (single root file for Next.js + Python agent) ---
if [ ! -f .env.local ]; then
  cp .env.example .env.local
  echo "==> created .env.local from .env.example"
  echo "    EDIT SECRETS before public exposure: CRON_SECRET, BASIC_AUTH_*, TELEGRAM_*, AI_*"
fi

# Ensure critical Python agent keys exist (idempotent append)
ensure_env_key() {
  local key="$1"
  local value="$2"
  if ! grep -q "^${key}=" .env.local 2>/dev/null; then
    echo "${key}=${value}" >> .env.local
    echo "==> appended ${key} to .env.local"
  fi
}
ensure_env_key "PYTHON_AGENT_URL" "http://127.0.0.1:8000"
ensure_env_key "PYTHON_AGENT_TIMEOUT_MS" "20000"
ensure_env_key "MARKET_DATA_MODE" "dashboard"
ensure_env_key "DASHBOARD_HOST" "127.0.0.1"
ensure_env_key "DASHBOARD_PORT" "8000"

# --- python venv ---
if [ -d agent ]; then
  if [ ! -x agent/.venv/bin/python ]; then
    echo "==> creating agent venv"
    python3 -m venv agent/.venv
  fi
  echo "==> installing agent requirements"
  agent/.venv/bin/pip install --upgrade pip
  agent/.venv/bin/pip install -r agent/requirements.txt
fi

# --- node build ---
echo "==> npm ci"
npm ci

if [ "${SKIP_CHECKS}" -eq 0 ]; then
  echo "==> npm run check"
  npm run check
else
  echo "==> skipping checks"
fi

echo "==> npm run build"
npm run build

# --- pm2 ---
chmod +x scripts/python-agent/start.sh 2>/dev/null || true
chmod +x scripts/python-agent/worker.sh 2>/dev/null || true
echo "==> pm2 startOrReload (web, python-screener, worker, python-agent)"
pm2 startOrReload ecosystem.config.cjs --update-env
pm2 save

echo "==> process status"
pm2 status

# --- health ---
sleep 2
echo "==> health probes"
curl -sS -o /dev/null -w "web: %{http_code}\n" "http://127.0.0.1:3000/" || true
curl -sS -o /dev/null -w "python-agent: %{http_code}\n" "http://127.0.0.1:8000/api/v1/health" || true

# --- domain (optional) ---
if [ "${SKIP_DOMAIN}" -eq 0 ] && [ -n "${DOMAIN}" ]; then
  echo "==> configuring domain ${DOMAIN}"
  DOMAIN_ARGS=("${DOMAIN}" --www)
  if [ -n "${TLS_EMAIL}" ]; then
    DOMAIN_ARGS+=(--tls "${TLS_EMAIL}")
  fi
  if [ "$(id -u)" -eq 0 ]; then
    bash deploy/setup-domain.sh "${DOMAIN_ARGS[@]}"
  else
    echo "Domain setup needs root. Run:"
    echo "  sudo bash deploy/setup-domain.sh ${DOMAIN_ARGS[*]}"
  fi
fi

echo
echo "Done."
echo "  Web:          http://127.0.0.1:3000"
echo "  Python agent: http://127.0.0.1:8000/api/v1/health"
echo "  Logs:         pm2 logs"
echo "  Domain:       sudo bash deploy/setup-domain.sh your.domain --tls you@email.com"
echo "  Boot persist: pm2 startup && pm2 save"
