#!/usr/bin/env pwsh
# Windows launcher for the Python Action Call service.
# Mirrors scripts/python-agent/start.sh but uses Windows venv paths.
$ErrorActionPreference = 'Stop'
$ROOT_DIR = (Resolve-Path "$PSScriptRoot/../..").Path
$AGENT_DIR = Join-Path $ROOT_DIR 'agent'
$VENV_PY = Join-Path $AGENT_DIR '.venv\Scripts\python.exe'
$VENV_PIP = Join-Path $AGENT_DIR '.venv\Scripts\pip.exe'

Set-Location $AGENT_DIR

if (-not (Test-Path $VENV_PY)) {
  $sysPy = (Get-Command python).Source
  & $sysPy -m venv .venv
  & $VENV_PIP install --upgrade pip
  & $VENV_PIP install -r requirements.txt
}

if (-not $env:MARKET_DATA_MODE) { $env:MARKET_DATA_MODE = 'dashboard' }
if (-not $env:DASHBOARD_HOST)   { $env:DASHBOARD_HOST = '127.0.0.1' }
if (-not $env:DASHBOARD_PORT)   { $env:DASHBOARD_PORT = '8000' }

& $VENV_PY main.py
