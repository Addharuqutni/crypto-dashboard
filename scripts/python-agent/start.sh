#!/usr/bin/env bash
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
AGENT_DIR="${ROOT_DIR}/agent"
VENV_PY="${AGENT_DIR}/.venv/bin/python"
VENV_PIP="${AGENT_DIR}/.venv/bin/pip"
cd "${AGENT_DIR}"
# A venv built on another OS/arch has a present-but-dead interpreter, so verify
# it actually runs before trusting it.
if ! "${VENV_PY}" -c "import sys" >/dev/null 2>&1; then
  rm -rf .venv
  python3 -m venv .venv
  "${VENV_PIP}" install --upgrade pip
  "${VENV_PIP}" install -r requirements.txt
fi
export MARKET_DATA_MODE="${MARKET_DATA_MODE:-dashboard}"
export DASHBOARD_HOST="${DASHBOARD_HOST:-127.0.0.1}"
export DASHBOARD_PORT="${DASHBOARD_PORT:-8000}"
exec "${VENV_PY}" main.py
