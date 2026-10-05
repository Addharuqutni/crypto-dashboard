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

## Screener

| Variable | Required | Description | Example / Default |
|----------|----------|-------------|-------------------|
| `SCREENER_STORAGE_MODE` | No | `/api/screener` mode: `file` serves persisted output; `on-demand` runs a fresh cycle per request | `file` |
| `SCREENER_FILE_MODE_STRICT` | No | When `1`, disable on-demand fallback if the file snapshot is missing | `1` (VPS) |
| `SCREENER_API_RATE_LIMIT_PER_MINUTE` | No | Per-client request cap for `/api/screener` | `30` |
| `SCREENER_SYMBOLS` | No | Comma-separated symbol override. Empty = top-100 Binance USDT perpetual | empty |
| `SCREENER_MAX_SYMBOLS` | No | Cap on universe size | `100` |
| `SCREENER_MAX_CONCURRENT_SYMBOLS` | No | Parallel symbol evaluation concurrency | `3` |
| `SCREENER_CANDLE_LIMIT` | No | Candles fetched per timeframe per symbol | `120` |
| `SCREENER_INTERVAL_MINUTES` | No | Cycle interval for the long-running screener process (`1`–`1440`) | `15` |
| `SCREENER_STORAGE_DIR` | No | Directory the Python engine writes snapshots to, and the Next.js reader reads from | `data/screener` |
| `CRON_SECRET` | Yes for cron/scan | Bearer token for `GET /api/cron/screener` and `POST /api/action-call` | long random secret |
| `TRUST_PROXY` | No | When `1`, rate limits trust `X-Real-IP` / last `X-Forwarded-For` hop (set only behind nginx) | unset |

### Screener alert policy

These gate which ranked rows become alerts. The defaults are deliberately
conservative — ranking is risk-first, so a low-confidence or low-RR setup is
rejected outright. Set them in the same file as the rest.

| Variable | Required | Description | Example / Default |
|----------|----------|-------------|-------------------|
| `SCREENER_MIN_CONFIDENCE` | No | Minimum confidence (`0`–`100`) for a row to alert | `75` |
| `SCREENER_MIN_GRADE` | No | Minimum grade: `A`, `B`, `C`, or `D` | `B` |
| `SCREENER_MIN_RISK_REWARD` | No | Minimum risk/reward ratio | `1.5` |
| `SCREENER_MAX_ALERTS_PER_HOUR` | No | Alert rate cap per hour | `10` |
| `SCREENER_ALERT_COOLDOWN_MINUTES` | No | Per-symbol/action cooldown. Effective cooldown is also bounded by `SCREENER_ACTION_CALL_MAX_ROWS`, since aged-out rows stop blocking | `10` |

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
| `SCREENER_HISTORY_MAX_ROWS` | No | Row cap for `history.json`; oldest dropped first | `5000` |
| `SCREENER_ACTION_CALL_MAX_ROWS` | No | Row cap for `action-calls.json`; oldest dropped first | `5000` |
| `DATABASE_ENABLED` / `DATABASE_URL` | No | Optional Postgres dataset mirror | off |

## Basic Auth (optional)

| Variable | Required | Description | Default |
|----------|----------|-------------|---------|
| `BASIC_AUTH_ENABLED` | No | Enable HTTP Basic Auth when `1` | `0` |
| `BASIC_AUTH_USER` | If auth enabled | Username | `admin` |
| `BASIC_AUTH_PASSWORD` | If auth enabled | Strong password | — |

Private VPS: set `BASIC_AUTH_ENABLED=1`, `TRUST_PROXY=1` (behind nginx), and a long `PYTHON_AGENT_INTERNAL_TOKEN` (required for Python API write/analyze routes).

## Server-side AI (optional, shared)

| Variable | Required | Description |
|----------|----------|-------------|
| `AI_BASE_URL` | For server AI | OpenAI-compatible base URL (HTTPS for remote) |
| `AI_API_KEY` | For server AI | Provider API key |
| `AI_MODEL` | For server AI | Model name |

Used by Next.js AI routes and the Python agent (which also accepts `AI_MODEL_*` aliases).

The Python agent additionally supports an optional AI review filter, configured
separately from the keys above: `AI_MODEL_ENABLED`, `AI_MODEL_PROVIDER`
(`gemini` | `openai_compatible` | `custom`), `AI_MODEL_API_KEY`,
`GEMINI_API_KEY`, `AI_MODEL_NAME`, `AI_MODEL_BASE_URL`, `AI_MODEL_TIMEOUT`, and
`AI_MODEL_MIN_SCORE`. When enabled, an action call is only sent to Telegram if the
review returns `APPROVE` with `score >= AI_MODEL_MIN_SCORE`. The review never
overrides the deterministic signal; it only filters delivery and annotates the
dataset.

## AI Signal Agent CLI (optional)

| Variable | Required | Description | Default |
|----------|----------|-------------|---------|
| `AGENT_TOP_N` | No | Setups summarized when `--topN` is omitted (`npm run agent`) | `5` |

## Telegram Worker (optional)

| Variable | Required | Description | Default |
|----------|----------|-------------|---------|
| `TELEGRAM_BOT_TOKEN` | For delivery | BotFather token | — |
| `TELEGRAM_CHAT_ID` | For delivery | Target chat/channel ID | — |
| `WORKER_SYMBOLS` | No | Symbols to evaluate | `BTCUSDT` |
| `WORKER_INTERVAL_MIN` | No | Cycle interval (minutes) | `15` |
| `WORKER_SETUP_TF` | No | Setup timeframe | `30m` |
| `WORKER_MACRO_TF` | No | Macro confirmation timeframe | `4h` |
| `WORKER_TRIGGER_TF` | No | Trigger timeframe | `15m` |
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
SCREENER_STORAGE_MODE=file
SCREENER_FILE_MODE_STRICT=1
SCREENER_MAX_SYMBOLS=100
BASIC_AUTH_ENABLED=1
MARKET_DATA_MODE=dashboard
DASHBOARD_HOST=127.0.0.1
DASHBOARD_PORT=8000
PYTHON_AGENT_URL=http://127.0.0.1:8000
```

Deploy scripts (`deploy/run-vps.sh`, `deploy/deploy-vps.sh`) create `.env.local` from `.env.example` and fill missing production keys.
