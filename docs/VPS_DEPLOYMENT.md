# VPS Deployment Guide

<!-- Source: deploy/deploy-vps.sh, ecosystem.config.cjs, .env.example, deploy/nginx.crypto-dashboard.conf -->

Step-by-step guide for a long-running VPS deployment with PM2 and nginx.

## Prerequisites

| Requirement | Notes |
|---|---|
| Ubuntu/Debian VPS (or similar) | Root or sudo access |
| Node.js `>=22` | `node -v` |
| npm `>=10` | Bundled with Node 22 |
| PM2 | `npm install -g pm2` |
| nginx (recommended) | Reverse proxy to port 3000 |
| Domain (optional) | Point A record at VPS IP |

## 1. Install system dependencies

```bash
# Node 22 via NodeSource or nvm — example with nvm:
curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
source ~/.nvm/nvm.sh
nvm install 22
nvm use 22

npm install -g pm2
sudo apt update && sudo apt install -y nginx git
```

## 2. Clone and enter the project

```bash
git clone <your-repo-url> crypto-dashboard
cd crypto-dashboard
```

## 3. Configure environment

```bash
cp .env.example .env.local
nano .env.local   # or your preferred editor
```

**Must change before public exposure:**

| Variable | Action |
|---|---|
| `CRON_SECRET` | Long random secret |
| `BASIC_AUTH_PASSWORD` | Strong password (if `BASIC_AUTH_ENABLED=1`) |
| `TELEGRAM_BOT_TOKEN` / `TELEGRAM_CHAT_ID` | Only if using worker alerts |
| `AI_*` | Only if using server-side AI |

**Recommended production values** (set these in root `.env.local`; deploy scripts also fill missing keys):

```env
SCREENER_STORAGE_MODE=file
SCREENER_STORAGE_BACKEND=file
SCREENER_REQUIRE_DATABASE=0
SCREENER_FILE_MODE_STRICT=1
DISABLE_SCREENER_SCHEDULER=1
BASIC_AUTH_ENABLED=1
```

## 4. Deploy

**Recommended one-shot** (build + PM2 + optional domain):

```bash
# App only
npm run run:vps
# equivalent: bash deploy/run-vps.sh

# App + domain + TLS
DOMAIN=example.com TLS_EMAIL=you@example.com npm run run:vps
# or:
bash deploy/run-vps.sh --domain example.com --tls you@example.com
```

**Deploy-only** (no domain):

```bash
npm run deploy:vps
# equivalent: bash deploy/deploy-vps.sh
```

What the deploy script does:

1. Verifies Node >= 22
2. Creates `logs/`, `data/screener/`, `data/worker/`
3. Creates `.env.local` from example if missing (+ `PYTHON_AGENT_URL`)
4. `npm ci`
5. `npm run check` (typecheck + lint + test)
6. `npm run build`
7. `npm run screener -- --once` (seed snapshot)
8. Python Action Call venv (reads root `.env.local`; `MARKET_DATA_MODE=dashboard`)
9. `pm2 startOrReload ecosystem.config.cjs --update-env && pm2 save`

## 5. PM2 process model

| App name | Script | Role |
|---|---|---|
| `crypto-dashboard-web` | `scripts/start-prod.mjs` | Next.js standalone on `127.0.0.1:3000` |
| `crypto-dashboard-screener` | `scripts/screener/start.ts` | Continuous screener → `data/screener/` (calls Python agent) |
| `crypto-dashboard-worker` | `scripts/worker/start.ts` | Telegram trade alerts (calls Python agent) |
| `crypto-dashboard-python-agent` | `scripts/python-agent/start.sh` | **Python Action Call API** on `127.0.0.1:8000` |

Web/screener/worker env overrides (from `ecosystem.config.cjs`):

```js
NODE_ENV=production
PORT=3000
HOSTNAME=127.0.0.1
DISABLE_SCREENER_SCHEDULER=1
SCREENER_STORAGE_MODE=file
PYTHON_AGENT_URL=http://127.0.0.1:8000
PYTHON_AGENT_TIMEOUT_MS=20000
```

Useful PM2 commands:

```bash
pm2 status
pm2 logs crypto-dashboard-web
pm2 logs crypto-dashboard-screener
pm2 logs crypto-dashboard-python-agent
pm2 restart crypto-dashboard-web
pm2 restart crypto-dashboard-python-agent
pm2 save
pm2 startup   # enable boot persistence — follow printed instructions
```

### Python agent only (manual)

```bash
npm run python-agent
# or: bash scripts/python-agent/start.sh
curl -sS http://127.0.0.1:8000/api/v1/health
curl -sS "http://127.0.0.1:8000/api/v1/analyze?symbol=BTC"
```

## 6. Domain + nginx

**Automated (preferred):**

```bash
# DNS first: A record example.com → VPS IP
sudo bash deploy/setup-domain.sh example.com --www --tls you@example.com
# npm alias (still needs sudo for nginx):
# sudo npm run setup:domain -- example.com --tls you@example.com
```

What it does:

1. Writes `/etc/nginx/sites-available/crypto-dashboard`
2. Enables site, disables default if present
3. Reloads nginx
4. Optionally runs certbot with HTTP→HTTPS redirect

**Manual template:**

```bash
sudo cp deploy/nginx.crypto-dashboard.conf /etc/nginx/sites-available/crypto-dashboard
sudo nano /etc/nginx/sites-available/crypto-dashboard
# replace example.com with your domain

sudo ln -sf /etc/nginx/sites-available/crypto-dashboard /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
sudo certbot --nginx -d example.com -d www.example.com
```

Template proxies `http://127.0.0.1:3000` only. **Do not** expose Python `:8000` publicly.

### DNS checklist

| Record | Name | Value |
|---|---|---|
| A | `@` / `example.com` | VPS public IPv4 |
| A or CNAME | `www` | VPS IP or `example.com` |
| AAAA (optional) | `@` | VPS IPv6 |

Wait for DNS before certbot (`dig +short example.com`).

## 7. Verify

```bash
# Local
curl -sS -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3000/
curl -sS http://127.0.0.1:3000/api/screener | head -c 200
curl -sS http://127.0.0.1:8000/api/v1/health
curl -sS "http://127.0.0.1:8000/api/v1/analyze?symbol=BTC" | head -c 200

# Via domain (after DNS + nginx)
curl -sS -o /dev/null -w "%{http_code}\n" https://example.com/
```

Expect:

- Web responds 200 (or 401 if Basic Auth is on)
- Screener JSON includes `ok: true` and a recent `latest.completedAt`
- Python agent health returns `{ "ok": true, ... }`
- `pm2 status` shows all four apps online

## 8. Updates / redeploy

```bash
cd /path/to/crypto-dashboard
git pull
npm run deploy:vps
# or full path including domain refresh:
# DOMAIN=example.com bash deploy/run-vps.sh --skip-domain
```

## 9. Rollback

```bash
git checkout <previous-good-sha>
npm run deploy:vps
```

If only the web process is bad and you have a previous build artifact, restore the previous `.next/standalone` and restart:

```bash
pm2 restart crypto-dashboard-web
```

## Troubleshooting

| Symptom | Fix |
|---|---|
| `Node.js >=22 is required` | Upgrade Node, re-run deploy |
| PM2 not found | `npm install -g pm2` then re-run deploy |
| Web online, empty screener | `npm run screener -- --once`; check `data/screener/latest.json` |
| Action Call empty / 502 on analyze | `pm2 logs crypto-dashboard-python-agent`; `curl 127.0.0.1:8000/api/v1/health` |
| Python agent missing | Ensure `agent/.venv` exists; `npm run python-agent` |
| 502 from nginx | Confirm web is up: `pm2 logs crypto-dashboard-web`; `curl 127.0.0.1:3000` |
| Certbot DNS fail | Wait for A record; `dig +short example.com` must match VPS IP |
| Basic Auth loops | Check `BASIC_AUTH_*` in `.env.local`; restart web |
| Telegram silent | Set token/chat; `pm2 logs crypto-dashboard-worker` |

More operational detail: [RUNBOOK.md](./RUNBOOK.md).

## Security checklist

- [ ] `.env.local` is not committed
- [ ] `CRON_SECRET` is random and long
- [ ] Basic Auth enabled for private dashboards
- [ ] nginx terminates TLS
- [ ] Firewall allows 80/443 only (app binds `127.0.0.1:3000`)
- [ ] No exchange trading keys in the app
