# Runbook

Operational guide for deploying, monitoring, and recovering the crypto-dashboard.

## Architecture at a Glance

| Process | Role | Typical host |
|---------|------|--------------|
| Next.js app (`crypto-dashboard-web`) | UI + BFF API routes | `127.0.0.1:3000` behind nginx |
| Python screener (`crypto-dashboard-python-screener`) | Periodic dashboard-mode scan and persisted Python screener data | PM2 on VPS |
| Worker (`crypto-dashboard-worker`) | Telegram trade/health alerts via Python Action Call | PM2 on VPS |
| Python Action Call (`crypto-dashboard-python-agent`) | **Sole signal engine** FastAPI on `127.0.0.1:8000` | PM2 on VPS |
| TS AI agent (`npm run agent`) | Optional read-only AI over Python data — **not** the signal engine | optional |

All trade signals come from the Python agent (`PYTHON_AGENT_URL`). The Next.js app is a BFF and does not run the removed TypeScript screener engine.

## Health Checks

| Check | How |
|-------|-----|
| App HTTP | `curl -fsS http://127.0.0.1:3000/` (expect 200; 401 if Basic Auth enabled) |
| Screener API | `curl -fsS http://127.0.0.1:3000/api/screener` — body should include `ok: true` and a recent `latest.completedAt` |
| Python Action Call | `curl -fsS http://127.0.0.1:8000/api/v1/health` — expect `{ "ok": true, ... }` |
| Analyze smoke | `curl -fsS "http://127.0.0.1:8000/api/v1/analyze?symbol=BTC"` |
| Agent API (TS AI) | `curl -fsS http://127.0.0.1:3000/api/agent` — 404 if no screener snapshot yet |
| Cron (if used) | `curl -fsS -H "Authorization: Bearer $CRON_SECRET" http://127.0.0.1:3000/api/cron/screener` |
| PM2 | `pm2 status` — web, Python screener, worker, and Python agent all `online` |
| Snapshot freshness | `curl -fsS http://127.0.0.1:8000/api/v1/screener/latest` — verify the latest timestamp is recent |
| Logs | `pm2 logs crypto-dashboard-web --lines 100` / `crypto-dashboard-python-screener` / `crypto-dashboard-python-agent` |

### Freshness rule of thumb

If the latest Python screener timestamp is older than `2 × SCREENER_INTERVAL_MINUTES`, treat the screener as stale. Check PM2 status and Binance connectivity first.

## Deployment

### VPS (recommended)

Prerequisites: Node 22+, npm 10+, Python 3 + venv, PM2 (`npm i -g pm2`), optional nginx reverse proxy.

```bash
# First-time full bring-up (build + PM2 + optional domain)
DOMAIN=example.com TLS_EMAIL=you@example.com bash deploy/run-vps.sh
# or: npm run run:vps

# Upgrade / redeploy only
git pull
bash deploy/deploy-vps.sh
# or: npm run deploy:vps
```

What the deploy script does:

1. Verifies Node ≥ 22
2. Creates `logs/`, `data/screener/`, `data/worker/`
3. Seeds root `.env.local` from `.env.example` if missing (unified Next + Python env)
4. `npm ci` → `npm run check` → `npm run build`
5. Python Action Call venv (loads root `.env.local`; dashboard mode)
6. Starts the Python screener worker and FastAPI service via PM2
7. `pm2 startOrReload ecosystem.config.cjs --update-env && pm2 save`

Post-deploy:

```bash
# Edit secrets if first run
$EDITOR .env.local

# Domain + TLS (preferred)
sudo bash deploy/setup-domain.sh example.com --www --tls you@example.com

# Or manual nginx template: deploy/nginx.crypto-dashboard.conf
# Confirm
pm2 status
curl -fsS http://127.0.0.1:3000/api/screener | head
curl -fsS http://127.0.0.1:8000/api/v1/health
```

### Manual / bare process

```bash
npm ci
npm run check
npm run build
# Python signal engine first
npm run python-agent
# then app + Telegram worker in separate terminals/services
npm run start:prod          # standalone server.js
npm run worker
```

### cPanel shared hosting

```bash
# From project root
bash deploy/deploy-cpanel.sh   # or deploy/deploy-cpanel.bat on Windows build host
```

Produces `crypto-dashboard-deploy.zip`. Upload, extract, set Application Startup File to `server.js`, and run `node server.js`. Screener/worker background loops are limited on shared hosting — prefer VPS for full features.

### Serverless / Vercel

- Set `SCREENER_STORAGE_BACKEND=supabase` + Supabase credentials
- Schedule `GET /api/cron/screener` with `Authorization: Bearer $CRON_SECRET`
- Keep `CRON_SECRET` long and private

## Process Management (PM2)

Config: [`ecosystem.config.cjs`](../ecosystem.config.cjs)

| App name | Script | Notes |
|----------|--------|-------|
| `crypto-dashboard-web` | `scripts/start-prod.mjs` | `DISABLE_SCREENER_SCHEDULER=1`; `PYTHON_AGENT_URL` |
| `crypto-dashboard-python-screener` | `scripts/python-agent/worker.sh` | Runs the Python dashboard-mode screener |
| `crypto-dashboard-worker` | `scripts/worker/start.ts` | Telegram alerts from Python Action Call |
| `crypto-dashboard-python-agent` | `scripts/python-agent/start.sh` | FastAPI Action Call on `:8000` |

```bash
pm2 startOrReload ecosystem.config.cjs --update-env
pm2 save
pm2 restart crypto-dashboard-web
pm2 restart crypto-dashboard-python-agent
pm2 logs crypto-dashboard-python-screener --lines 200
pm2 logs crypto-dashboard-python-agent --lines 200
pm2 stop crypto-dashboard-worker
```

## Common Issues

### `/api/screener` returns empty / on-demand fallback

- Cause: the Python service has no current snapshot, or `SCREENER_FILE_MODE_STRICT=1` prevents fallback.
- Fix:
  ```bash
  pm2 restart crypto-dashboard-python-agent
  pm2 restart crypto-dashboard-python-screener
  curl -fsS http://127.0.0.1:8000/api/v1/screener/run
  ```

### Screener stuck / Binance rate limits

- Lower `SCREENER_MAX_CONCURRENT_SYMBOLS` (e.g. `1`–`2`)
- Raise `SCREENER_INTERVAL_MINUTES`
- Reduce `SCREENER_MAX_SYMBOLS` or set a smaller `SCREENER_SYMBOLS` list

### `401 Unauthorized` on every page

- Basic Auth is enabled (`BASIC_AUTH_ENABLED=1`)
- Use the configured `BASIC_AUTH_USER` / `BASIC_AUTH_PASSWORD`, or set `BASIC_AUTH_ENABLED=0`

### `/api/cron/screener` → 401 / 500

- `500` with "Cron secret is not configured" → set `CRON_SECRET`
- `401 Unauthorized` → send `Authorization: Bearer <CRON_SECRET>`

### Telegram worker silent

- Confirm `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID`
- Worker still runs without credentials but skips delivery
- Check `WORKER_CONTINUE_ON_TELEGRAM_FAILURE` and PM2 logs

### AI chat / agent returns "AI is not configured"

- Set `AI_BASE_URL`, `AI_API_KEY`, `AI_MODEL` (HTTPS required for remote providers)
- Or configure the browser-side AI settings modal for client chat

### Standalone start fails

```text
[start:prod] Missing .next/standalone/server.js
```

Run `npm run build` first. `start:prod` copies `.next/static` and `public` into the standalone tree automatically.

### Typecheck / tests fail after pull

```bash
rm -rf node_modules .next
npm ci
npm run check
```

## Rollback

1. **Code rollback**
   ```bash
   git log --oneline -10
   git checkout <known-good-sha>
   npm ci
   npm run build
   pm2 startOrReload ecosystem.config.cjs --update-env
   ```

2. **Process-only rollback** (keep code, restart previous PM2 dump)
   ```bash
   pm2 kill
   pm2 resurrect
   ```

3. **Data caution**: `agent/datasets/` and `data/worker/` are runtime state. Prefer keeping them across deploys. If Python screener data is corrupted, stop the Python processes, move the affected dataset aside, and restart `crypto-dashboard-python-screener`.

## Alerting & Escalation

| Symptom | First action | Escalate when |
|---------|--------------|---------------|
| Snapshot stale > 2 intervals | Restart `crypto-dashboard-python-screener`, check Binance | Repeats after restart |
| App 5xx | `pm2 logs crypto-dashboard-web`, free disk/memory | Sustained errors |
| Worker health alerts fire | Inspect worker logs + Telegram credentials | Delivery fails > 1h |
| Auth lockout | Verify Basic Auth env | Credentials rotated without deploy |

There is no external pager integration in-repo. Wire PM2 + host monitoring (e.g. Uptime Kuma hitting `/` and `/api/screener`) for production.

## Security Checklist (ops)

- [ ] `.env.local` mode `600`, not world-readable
- [ ] `CRON_SECRET` and Basic Auth password are long random values
- [ ] `SUPABASE_SERVICE_ROLE_KEY` never exposed to the browser
- [ ] nginx terminates TLS; app binds to `127.0.0.1`
- [ ] No exchange trading keys in this app — read-only market data only
