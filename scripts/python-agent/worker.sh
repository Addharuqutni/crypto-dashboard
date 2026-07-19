#!/usr/bin/env bash
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
AGENT_DIR="${ROOT_DIR}/agent"
VENV_PY="${AGENT_DIR}/.venv/bin/python"
cd "${AGENT_DIR}"
exec "${VENV_PY}" -m src.screener.worker
