# Crypto Market Dashboard

Crypto Market Dashboard adalah aplikasi dashboard analisis pasar crypto berbasis **Next.js App Router** untuk memantau **Binance USDⓈ-M Futures** secara real time. Next.js menyediakan UI dan BFF routes, sedangkan Python Action Call service menjadi sumber sinyal dan screener. Project ini menyediakan market overview, candlestick chart, technical analysis, screener, AI-assisted commentary, signal journal, watchlist, alert lokal, dan worker Telegram.

> **Disclaimer:** Project ini dibuat untuk edukasi, analisis, dan journaling. Bukan financial advice, bukan sinyal pasti, dan bukan jaminan profit.

## Table of Contents

- [Features](#features)
- [Tech Stack](#tech-stack)
- [Requirements](#requirements)
- [Installation](#installation)
- [Environment Variables](#environment-variables)
- [Development](#development)
- [Scripts](#scripts)
- [Futures Screener](#futures-screener)
- [AI Signal Agent](#ai-signal-agent)
- [Telegram Worker](#telegram-worker)
- [Project Structure](#project-structure)
- [Quality Checks](#quality-checks)
- [Deployment](#deployment)
- [Security Notes](#security-notes)
- [Risk Notes](#risk-notes)

## Features

### Market Dashboard

- Real-time Binance USDⓈ-M Futures prices via WebSocket.
- 24h change, volume, market movement, and market overview.
- Coin search and responsive UI for desktop and mobile.

### Chart & Technical Analysis

- Candlestick and volume chart using TradingView Lightweight Charts.
- Binance Futures OHLCV data.
- Clean and technical chart modes.
- EMA, RSI, MACD, ATR, ADX, Fibonacci, support/resistance, order block, liquidity sweep, trend, and regime detection.

### Python Action Call and Screener

- Python FastAPI provides the sole signal and screener engine.
- Multi-timeframe action calls produce entry, stop loss, take profit, risk-reward, confidence, and market context.
- Dynamic Binance USDⓈ-M universe selection with configured symbol overrides.
- Next.js `/api/action-call` and `/api/screener` routes proxy the internal service.
- Optional local JSON/JSONL datasets and Telegram delivery.

### AI Tools

- OpenAI-compatible technical summary and chat.
- Optional streaming response.
- Optional client-side API key persistence.
- Server-side AI Signal Agent for read-only decision-support summaries.

### Journal, Watchlist, and Alerts

- Signal journal with status tracking: pending, TP1, TP2, TP3, SL, expired, and cancelled.
- PnL, MFE, MAE, win rate, loss rate, and LONG/SHORT distribution.
- Browser-local watchlist and alerts.
- Telegram worker for optional external alert delivery.

## Tech Stack

| Area | Technology |
|---|---|
| Framework | Next.js 16 App Router |
| UI | React 19, Tailwind CSS 4, Lucide React |
| Language | TypeScript 6 |
| State | Zustand 5, TanStack Query 5 |
| Charts | TradingView Lightweight Charts 5 |
| Testing | Vitest 4 |
| Tooling | ESLint 10, Prettier 3, tsx |
| Data Sources | Binance Futures API, CoinGecko API, Alternative.me API |

## Requirements

- Node.js `>=22.0.0`
- npm `>=10.0.0`
- Internet access for Binance, CoinGecko, Alternative.me, and optional AI providers
- Telegram bot token and chat ID for Telegram alerts

## Installation

```bash
npm install
```

## Environment Variables

Create the shared runtime environment file from the committed template:

```bash
cp .env.example .env.local
```

On Windows Command Prompt:

```cmd
copy .env.example .env.local
```

Next.js and the Python agent both load this root `.env.local`. See [`docs/ENV.md`](docs/ENV.md) for the complete reference.

### Application

| Variable | Description | Required | Default |
|---|---|---:|---|
| `BASIC_AUTH_ENABLED` | Enable Basic Auth when set to `1` | No | Disabled |
| `BASIC_AUTH_USER` | Basic Auth username | If auth enabled | - |
| `BASIC_AUTH_PASSWORD` | Basic Auth password | If auth enabled | - |

### Screener API

| Variable | Description | Required | Default |
|---|---|---:|---|
| `SCREENER_STORAGE_MODE` | `/api/screener` storage mode: `file` (default) or `on-demand` | No | `file` |
| `SCREENER_STORAGE_BACKEND` | Storage backend: `supabase` or `file` | No | `file` for VPS |
| `SCREENER_REQUIRE_DATABASE` | Require database storage and forbid file fallback when set to `1` | No | `0` for VPS |
| `CRON_SECRET` | Bearer token required by `/api/cron/screener` | Yes for cron | - |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL | For Supabase backend | - |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key, server-side only | For Supabase backend | - |
| `SCREENER_FILE_MODE_STRICT` | Disable on-demand fallback in file mode when set to `1` | No | `1` for VPS |
| `SCREENER_API_RATE_LIMIT_PER_MINUTE` | Request limit per client per minute | No | `30` |
| `SCREENER_UNIVERSE_MODE` | Universe mode for Python screener: `top_futures_volume` ranks active Binance USDⓈ-M USDT linear perpetuals by 24h futures quote volume | No | `top_futures_volume` |
| `SCREENER_SYMBOLS` | Comma-separated symbol override, e.g. `BTCUSDT,ETHUSDT` or `BTC/USDT`; when set, skips dynamic resolution | No | Empty (dynamic top-100) |
| `SCREENER_MAX_SYMBOLS` | Max symbols for screener universe | No | `100` |
| `SCREENER_UNIVERSE_CACHE_TTL_MINUTES` | In-process cache TTL for dynamic universe resolution | No | `30` |
| `INCLUDE_STABLECOINS` | When `true`, allow stablecoin bases (USDC, FDUSD, …) in dynamic universe | No | `false` |
| `SCREENER_MAX_CONCURRENT_SYMBOLS` | Symbol concurrency | No | `3` |
| `SCREENER_CANDLE_LIMIT` | Candle limit | No | `120` |
| `DISABLE_SCREENER_SCHEDULER` | Disable Next.js server scheduler when set to `1` | Recommended for PM2 screener process | `1` for VPS |

### AI Provider

| Variable | Description | Required |
|---|---|---:|
| `AI_BASE_URL` | OpenAI-compatible base URL. Remote URLs must use HTTPS. | For server-side AI |
| `AI_API_KEY` | AI provider API key | For server-side AI |
| `AI_MODEL` | AI model name | For server-side AI |

### Telegram Worker

| Variable | Description | Required |
|---|---|---:|
| `TELEGRAM_BOT_TOKEN` | Telegram bot token | For Telegram delivery |
| `TELEGRAM_CHAT_ID` | Target chat/channel ID | For Telegram delivery |
| `WORKER_SYMBOLS` | Comma-separated symbols | No |
| `WORKER_INTERVAL_MIN` | Worker interval in minutes | No |
| `WORKER_SETUP_TF` | Main setup timeframe | No |
| `WORKER_MACRO_TF` | Macro confirmation timeframe | No |
| `WORKER_TRIGGER_TF` | Trigger timeframe | No |
| `WORKER_ALERT_COOLDOWN_MIN` | Alert cooldown per symbol/action | No |
| `WORKER_MIN_CONFIDENCE` | Minimum confidence for alerts | No |
| `WORKER_SEND_WAIT_ALERTS` | Send `WAIT` alerts | No |
| `WORKER_SEND_HEALTH_ALERTS` | Send worker health alerts | No |
| `WORKER_DATA_DIR` | Worker state directory | No |
| `WORKER_CONTINUE_ON_TELEGRAM_FAILURE` | Continue worker loop when Telegram delivery fails | No |

> Do not commit `.env.local`, API keys, Telegram tokens, or private credentials.

## Development

Start the development server:

```bash
npm run dev
```

Use Webpack instead of Turbopack:

```bash
npm run dev:webpack
```

Open the application:

```text
http://localhost:3000
```

## Scripts

| Script | Description |
|---|---|
| `npm run dev` | Start development server with Turbopack |
| `npm run dev:webpack` | Start development server with Webpack |
| `npm run build` | Build production app with Turbopack |
| `npm run build:webpack` | Build production app with Webpack |
| `npm start` | Start standard Next.js production server |
| `npm run start:local` | Start production server on port 3000 |
| `npm run start:prod` | Start standalone production server from `.next/standalone/server.js` |
| `npm run lint` | Run ESLint for `src/` |
| `npm run typecheck` | Run TypeScript type checking without emit |
| `npm run test` | Run Vitest test suite |
| `npm run test:watch` | Run Vitest in watch mode |
| `npm run check` | Run typecheck, lint, and tests |
| `npm run audit:prod` | Audit production dependencies |
| `npm run agent` | Run the optional TypeScript AI agent |
| `npm run python-agent` | Start the Python Action Call service |
| `npm run worker` | Run Telegram alert worker |
| `npm run deploy:vps` | Deploy to a VPS |
| `npm run run:vps` | Deploy and optionally configure a domain |
| `npm run setup:domain` | Configure nginx and optional TLS |

## Python Screener

The Python Action Call service owns screener cycles. Start it from the repository root:

```bash
npm run python-agent
```

For the dashboard API, set `MARKET_DATA_MODE=dashboard`. The Next.js `/api/screener` route reads the latest Python snapshot by default; set `SCREENER_STORAGE_MODE=on-demand` to request a fresh Python run per request. The cron route triggers the Python scan with `CRON_SECRET` authentication.

The Python service stores its configured datasets under `agent/datasets/` and serves internal endpoints such as `/api/v1/screener/latest` and `/api/v1/screener/run`. Keep the service bound to localhost in production.

## AI Signal Agent

The optional TypeScript AI agent reads the latest Python screener/action-call data and generates read-only decision-support summaries.

Safety rules:

- Does not execute trades.
- Does not request exchange API keys.
- Does not override Python action-call decisions.
- Rejects risky AI output containing leverage, all-in sizing, API key requests, guaranteed profit, or equivalent claims.

Run the agent:

```bash
npm run agent
```

If `AI_BASE_URL`, `AI_API_KEY`, and `AI_MODEL` are not configured, the agent still returns deterministic decisions without AI enrichment.

## Telegram Worker

Run the Telegram worker:

```bash
npm run worker
```

Setup steps:

1. Create a Telegram bot via BotFather.
2. Copy the bot token to `TELEGRAM_BOT_TOKEN`.
3. Set the destination chat/channel in `TELEGRAM_CHAT_ID`.
4. Configure optional worker variables in `.env.local`.
5. Start the worker with `npm run worker`.

The worker can run without Telegram credentials for local state updates, but external delivery will be disabled.

## Project Structure

```text
crypto-dashboard/
├── data/                    # Local runtime data for screener and worker
├── agent/                   # Python Action Call service and screener
├── scripts/                 # Runtime scripts for worker, agent, and deployment
├── deploy/                  # VPS, cPanel, and nginx deployment helpers
├── src/
│   ├── app/                 # Next.js App Router pages and API routes
│   ├── components/          # UI components
│   ├── hooks/               # React hooks
│   ├── lib/                 # Domain, application, adapter, and shared layers
│   ├── stores/              # Zustand stores
│   └── types/               # Shared TypeScript types
├── next.config.ts           # Next.js configuration
├── package.json             # Scripts and dependencies
├── tsconfig.json            # TypeScript configuration
└── vitest.config.ts         # Vitest configuration
```

## Quality Checks

Run all checks before deployment or large changes:

```bash
npm run typecheck
npm run lint
npm run test
npm run build
```

Or run the shortcut:

```bash
npm run check
```

Production standalone smoke test:

```bash
npm run build
npm run start:prod
```

## Deployment

The project uses Next.js standalone output:

```ts
output: 'standalone'
```

Minimal deployment flow:

```bash
npm install
cp .env.example .env.local
npm run build
npm run python-agent
npm run start:prod
```

For production deployments, run the Python Action Call service and worker under a process manager such as PM2 or systemd:

```bash
npm run python-agent
npm run worker
```

## Security Notes

- Keep `.env.local` and all credential files out of version control.
- Enable `BASIC_AUTH_ENABLED=1` for private deployments.
- Prefer server-side AI credentials through `AI_BASE_URL`, `AI_API_KEY`, and `AI_MODEL`.
- Avoid storing AI provider keys in browser local storage on shared or public machines.
- Do not expose exchange trading API keys to the dashboard or AI agent.

## Risk Notes

- Signals are deterministic technical-analysis outputs, not predictions.
- Confidence score measures setup quality, not win probability.
- `WAIT` is a valid risk-first decision.
- Always use independent judgement, position sizing, stop loss, and risk management.
- Verify live market conditions before making trading decisions.
