# Runbook

<!-- AUTO-GENERATED: deployment-from-deploy-files:start -->
## VPS deployment

Source files: `deploy/deploy-vps.sh`, `deploy/vps.env.example`, `ecosystem.config.cjs`, `docs/VPS_DEPLOYMENT.md`.

Prerequisites:

- Ubuntu VPS
- Node.js >=22
- npm >=10
- PM2
- Nginx reverse proxy

First install:

```bash
cd /var/www
git clone <your-repo-url> crypto-dashboard
cd crypto-dashboard
cp deploy/vps.env.example .env.local
nano .env.local
chmod +x deploy/deploy-vps.sh
./deploy/deploy-vps.sh
```

Deploy updates:

```bash
cd /var/www/crypto-dashboard
git pull
./deploy/deploy-vps.sh
```

`deploy/deploy-vps.sh` performs:

1. Node.js major version check (`>=22`).
2. `logs`, `data/screener`, and `data/worker` directory creation.
3. `.env.local` creation from `deploy/vps.env.example` when missing.
4. `npm ci`.
5. `npm run check`.
6. `npm run build`.
7. `npm run screener -- --once`.
8. Python agent venv setup when `agent/` exists.
9. `pm2 startOrReload ecosystem.config.cjs --update-env` when PM2 exists.
<!-- AUTO-GENERATED: deployment-from-deploy-files:end -->

<!-- AUTO-GENERATED: processes-from-ecosystem:start -->
## PM2 processes

| Process | Purpose | Script | Logs |
|---------|---------|--------|------|
| `crypto-dashboard-web` | Next.js standalone web app | `scripts/start-prod.mjs` | `logs/pm2-web-out.log`, `logs/pm2-web-error.log` |
| `crypto-dashboard-screener` | Continuous screener writer | `scripts/screener/start.ts` | `logs/pm2-screener-out.log`, `logs/pm2-screener-error.log` |
| `crypto-ai-agent` | Python AI agent | `agent/main.py` | `logs/pm2-agent-out.log`, `logs/pm2-agent-error.log` |

Operations:

```bash
pm2 status
pm2 logs crypto-dashboard-web
pm2 logs crypto-dashboard-screener
pm2 restart crypto-dashboard-web
pm2 restart crypto-dashboard-screener
pm2 save
```
<!-- AUTO-GENERATED: processes-from-ecosystem:end -->

<!-- AUTO-GENERATED: health-from-route-files:start -->
## Health checks and endpoints

| Endpoint | Method | Purpose | Expected healthy result |
|----------|--------|---------|-------------------------|
| `/api/screener` | `GET` | Read latest screener output or run on-demand in dev. | `200` JSON with `ok: true`. |
| `/api/agent?topN=5` | `GET` | Run read-only AI Signal Agent against latest persisted screener snapshot. | `200` JSON with `ok: true`; `404` means no screener snapshot exists yet. |
| `/api/ai/test` | `POST` | Test OpenAI-compatible AI provider config. | `200` JSON when config works; `400` when invalid. |
| `/api/cron/screener` | `GET` | Protected screener cron entrypoint. | `200` JSON with `success: true` when `Authorization: Bearer $CRON_SECRET` is valid. |

Quick checks:

```bash
curl -fsS http://127.0.0.1:3000/api/screener
curl -fsS -H "Authorization: Bearer $CRON_SECRET" http://127.0.0.1:3000/api/cron/screener
```
<!-- AUTO-GENERATED: health-from-route-files:end -->

<!-- AUTO-GENERATED: data-files-from-code:start -->
## Data files

File-mode screener data lives under `data/screener/`:

```text
data/screener/latest.json
data/screener/history.jsonl
data/screener/alerts.jsonl
data/screener/settings.json
```

Worker data defaults to `data/worker/`.
<!-- AUTO-GENERATED: data-files-from-code:end -->

<!-- AUTO-GENERATED: common-issues:start -->
## Common issues

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| `Node.js >=22 is required` | VPS Node.js too old. | Install Node.js 22+ then rerun `./deploy/deploy-vps.sh`. |
| `/api/screener` returns no latest data | Screener has not written `data/screener/latest.json`. | Run `npm run screener -- --once`, then check `pm2 logs crypto-dashboard-screener`. |
| `/api/cron/screener` returns `401` | Missing/incorrect bearer token. | Send `Authorization: Bearer $CRON_SECRET`. |
| `/api/cron/screener` returns `500` with cron secret error | `CRON_SECRET` unset. | Set `CRON_SECRET` in `.env.local`/host env and reload PM2. |
| CSS/JS assets missing in production | Standalone static assets not copied. | Start via `npm run start:prod`, not bare `next start`, for standalone deployment. |
| Telegram alerts disabled | `TELEGRAM_BOT_TOKEN` or `TELEGRAM_CHAT_ID` empty. | Set both env vars and restart worker/screener process. |
| Public dashboard should be private | Basic auth disabled or weak credentials. | Set `BASIC_AUTH_ENABLED=1`, strong `BASIC_AUTH_USER`, strong `BASIC_AUTH_PASSWORD`. |
<!-- AUTO-GENERATED: common-issues:end -->

<!-- AUTO-GENERATED: rollback:start -->
## Rollback

```bash
cd /var/www/crypto-dashboard
git log --oneline -n 10
git checkout <known-good-commit>
npm ci
npm run check
npm run build
npm run screener -- --once
pm2 startOrReload ecosystem.config.cjs --update-env
pm2 save
```

If rollback fails, restore previous `.env.local`, then restart PM2:

```bash
pm2 restart crypto-dashboard-web crypto-dashboard-screener
```
<!-- AUTO-GENERATED: rollback:end -->

<!-- AUTO-GENERATED: escalation:start -->
## Alerting and escalation

This repo has no external alert manager config. Operational signals come from:

- PM2 status/logs
- HTTP health checks above
- Telegram worker delivery status when Telegram vars are set
- Nginx access/error logs on VPS

Escalate when:

- Web process restarts repeatedly.
- Screener stops updating `data/screener/latest.json`.
- Cron endpoint fails with `5xx` after env reload.
- Telegram delivery errors persist after token/chat verification.
<!-- AUTO-GENERATED: escalation:end -->
