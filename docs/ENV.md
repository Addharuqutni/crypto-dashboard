# Environment Variables

**One file for the whole monorepo.**

| File | Role |
|------|------|
| [`.env.example`](../.env.example) | Template (committed) — Next.js + Python Action Call |
| `.env.local` | Runtime config (gitignored). Copy from `.env.example` |

```bash
cp .env.example .env.local
# edit secrets, then:
npm run dev            # Next.js reads .env.local
npm run python-agent   # Python loads root .env.local then .env
```

> Never commit `.env.local`, API keys, Telegram tokens, or service-role credentials.

Python load order (`agent/src/config.py`):

1. Repo-root `.env.local`
2. Repo-root `.env`
3. Optional legacy `agent/.env` (override only if you still keep one)

Production uses the same root `.env.local` (seed production keys from the bottom of `.env.example` or let `deploy/*.sh` append them).

## Application Runtime

| Variable | Required | Description | Example / Default |
|----------|----------|-------------|-------------------|
| `NODE_ENV` | No | Runtime mode | `production` (VPS) |
| `PORT` | No | HTTP port | `3000` |
| `HOSTNAME` | No | Bind address | `127.0.0.1` |
| `DISABLE_SCREENER_SCHEDULER` | No | Retained compatibility flag for disabling a legacy in-process scheduler; production PM2 uses the Python screener process. | `0` / `1` |

## Screener

| Variable | Required | Description | Example / Default |
|----------|----------|-------------|-------------------|
| `SCREENER_STORAGE_MODE` | No | `/api/screener` mode: `file` serves persisted output; `on-demand` runs a fresh cycle per request | `file` |
| `SCREENER_STORAGE_BACKEND` | No | Persistence backend: `file` or `supabase` | `file` |
| `SCREENER_REQUIRE_DATABASE` | No | When `1`, forbid file fallback and require database storage | `0` |
| `SCREENER_FILE_MODE_STRICT` | No | When `1`, disable on-demand fallback if the file snapshot is missing | `1` (VPS) |
| `SCREENER_API_RATE_LIMIT_PER_MINUTE` | No | Per-client request cap for `/api/screener` | `30` |
| `SCREENER_SYMBOLS` | No | Comma-separated symbol override. Empty = top-100 Binance USDT perpetual | empty |
| `SCREENER_MAX_SYMBOLS` | No | Cap on universe size | `100` |
| `SCREENER_MAX_CONCURRENT_SYMBOLS` | No | Parallel symbol evaluation concurrency | `3` |
| `SCREENER_CANDLE_LIMIT` | No | Candles fetched per timeframe per symbol | `120` |
| `SCREENER_INTERVAL_MINUTES` | No | Cycle interval for the long-running screener process (`1`–`1440`) | `15` |
| `CRON_SECRET` | Yes for cron | Bearer token required by `GET /api/cron/screener` | long random secret |

## Python Action Call agent

| Variable | Required | Description | Example / Default |
|----------|----------|-------------|-------------------|
| `PYTHON_AGENT_URL` | Yes (prod) | Base URL Next.js uses to reach FastAPI | `http://127.0.0.1:8000` |
| `PYTHON_AGENT_TIMEOUT_MS` | No | HTTP timeout for agent calls | `20000` |
| `PYTHON_AGENT_INTERNAL_TOKEN` | No | Shared token for authenticating Next.js-to-Python internal calls when enabled | long random secret |
| `MARKET_DATA_MODE` | Yes (prod) | `dashboard` for FastAPI API mode | `dashboard` |
| `DASHBOARD_HOST` | No | FastAPI bind host | `127.0.0.1` (VPS) |
| `DASHBOARD_PORT` | No | FastAPI port | `8000` |
| `EXCHANGE` | No | ccxt exchange id | `binance` |
| `SYMBOLS` | No | Default pairs for standalone scanner | `BTC/USDT,...` |
| `USE_BINANCE_TOP_VOLUME` | No | Scanner universe from Binance volume | `true` |
| `SAVE_ACTION_DATASET` | No | Persist action-call dataset rows | `true` |
| `DATABASE_ENABLED` / `DATABASE_URL` | No | Optional Postgres dataset mirror | off |

## Supabase (optional)

| Variable | Required | Description |
|----------|----------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | For Supabase backend | Project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | For Supabase backend | Service-role key (server-side only) |

Leave both empty when using VPS file mode.

## Basic Auth (optional)

| Variable | Required | Description | Default |
|----------|----------|-------------|---------|
| `BASIC_AUTH_ENABLED` | No | Enable HTTP Basic Auth when `1` | `0` |
| `BASIC_AUTH_USER` | If auth enabled | Username | `admin` |
| `BASIC_AUTH_PASSWORD` | If auth enabled | Strong password | — |

## Server-side AI (optional, shared)

| Variable | Required | Description |
|----------|----------|-------------|
| `AI_BASE_URL` | For server AI | OpenAI-compatible base URL (HTTPS for remote) |
| `AI_API_KEY` | For server AI | Provider API key |
| `AI_MODEL` | For server AI | Model name |

Used by Next.js AI routes and the Python agent (which also accepts `AI_MODEL_*` aliases).

## Telegram Worker (optional)

| Variable | Required | Description | Default |
|----------|----------|-------------|---------|
| `TELEGRAM_BOT_TOKEN` | For delivery | BotFather token | — |
| `TELEGRAM_CHAT_ID` | For delivery | Target chat/channel ID | — |
| `WORKER_SYMBOLS` | No | Symbols to evaluate | `BTCUSDT` |
| `WORKER_INTERVAL_MIN` | No | Cycle interval (minutes) | `15` |
| `WORKER_ALERT_COOLDOWN_MIN` | No | Cooldown per symbol/action | `60` |
| `WORKER_MIN_CONFIDENCE` | No | Minimum confidence for alerts | `65` |
| `WORKER_SEND_WAIT_ALERTS` | No | Send WAIT alerts | `false` |
| `WORKER_SEND_HEALTH_ALERTS` | No | Send worker health alerts | `true` |
| `WORKER_HEALTH_ALERTS_PER_HOUR` | No | Health alert rate limit | `1` |
| `WORKER_DATA_DIR` | No | Worker state directory | `./data/worker` |
| `WORKER_CONTINUE_ON_TELEGRAM_FAILURE` | No | Keep loop on Telegram failure | `true` |

## Profiles

### Local development

```env
DISABLE_SCREENER_SCHEDULER=0
SCREENER_MAX_SYMBOLS=100
BASIC_AUTH_ENABLED=0
MARKET_DATA_MODE=dashboard
DASHBOARD_HOST=127.0.0.1
PYTHON_AGENT_URL=http://127.0.0.1:8000
```

### VPS / PM2 production

Same file (`.env.local`). Recommended values:

```env
NODE_ENV=production
PORT=3000
HOSTNAME=127.0.0.1
DISABLE_SCREENER_SCHEDULER=1
SCREENER_STORAGE_MODE=file
SCREENER_STORAGE_BACKEND=file
SCREENER_REQUIRE_DATABASE=0
SCREENER_FILE_MODE_STRICT=1
SCREENER_MAX_SYMBOLS=100
BASIC_AUTH_ENABLED=1
MARKET_DATA_MODE=dashboard
DASHBOARD_HOST=127.0.0.1
DASHBOARD_PORT=8000
PYTHON_AGENT_URL=http://127.0.0.1:8000
```

Deploy scripts (`deploy/run-vps.sh`, `deploy/deploy-vps.sh`) create `.env.local` from `.env.example` and fill missing production keys.

### Serverless / Vercel cron

```env
SCREENER_STORAGE_BACKEND=supabase
SCREENER_REQUIRE_DATABASE=1
CRON_SECRET=<long-random-secret>
NEXT_PUBLIC_SUPABASE_URL=<project-url>
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>
```
