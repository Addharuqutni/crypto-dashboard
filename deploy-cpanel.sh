#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

if [[ ! -f package.json || ! -f next.config.ts ]]; then
  echo "Aborting: run this script from the crypto-dashboard project root." >&2
  exit 1
fi

echo "[1/7] Installing clean dependencies..."
npm ci

echo "[2/7] Running production checks..."
npm run typecheck
npm run lint
npm run test

echo "[3/7] Building Next.js app..."
npm run build

echo "[4/7] Cleaning old deploy package..."
rm -rf deploy-package crypto-dashboard-deploy.zip
mkdir -p deploy-package

echo "[5/7] Copying standalone server files..."
cp -R .next/standalone/. deploy-package/

echo "[6/7] Copying static assets and public folder..."
mkdir -p deploy-package/.next
cp -R .next/static deploy-package/.next/static
if [[ -d public ]]; then
  cp -R public deploy-package/public
fi
if [[ -f .env.example ]]; then
  cp .env.example deploy-package/.env.example
fi

echo "[7/7] Creating zip archive..."
(
  cd deploy-package
  zip -r ../crypto-dashboard-deploy.zip .
)

echo "Done: crypto-dashboard-deploy.zip"
echo "cPanel startup file: server.js"
echo "cPanel run command: node server.js"
