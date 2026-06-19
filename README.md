# Crypto Market Dashboard

Crypto Market Dashboard adalah aplikasi dashboard analisis pasar crypto berbasis **Next.js App Router** untuk memantau **Binance USDⓈ-M Futures** secara real time. Project ini menyediakan market overview, candlestick chart, technical analysis, futures signal engine, screener, AI-assisted commentary, signal journal, watchlist, alert lokal, dan worker Telegram.

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

### Futures Signal Engine

- Deterministic `LONG`, `SHORT`, or `WAIT` decision engine.
- Entry zone, stop loss, take profit, risk-reward ratio, confidence score, and signal grade.
- Risk-first guards for multi-timeframe confirmation, funding rate, open interest, stale data, liquidity sweep, and no-trade conditions.

### Futures Screener

- Periodic evaluation for selected Binance Futures symbols.
- Ranked setup list with alert eligibility and block reasons.
- Local JSON/JSONL persistence for latest snapshot, history, settings, and alert records.
- Optional AI audit for top candidates.

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

Create a local environment file:

```bash
cp deploy/vps.env.example .env.local
```

On Windows Command Prompt:

```cmd
copy deploy\vps.env.example .env.local
```

### Application

| Variable | Description | Required | Default |
|---|---|---:|---|
| `BASIC_AUTH_ENABLED` | Enable Basic Auth when set to `1` | No | Disabled |
| `BASIC_AUTH_USER` | Basic Auth username | If auth enabled | - |
| `BASIC_AUTH_PASSWORD` | Basic Auth password | If auth enabled | - |

### Screener API

| Variable | Description | Required | Default |
|---|---|---:|---|
| `SCREENER_STORAGE_MODE` | `/api/screener` mode: `file` or `on-demand` | No | `file` on production, `on-demand` in local dev |
| `SCREENER_STORAGE_BACKEND` | Storage backend: `supabase` or `file` | No | `file` for VPS |
| `SCREENER_REQUIRE_DATABASE` | Require database storage and forbid file fallback when set to `1` | No | `0` for VPS |
| `CRON_SECRET` | Bearer token required by `/api/cron/screener` | Yes for cron | - |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL | For Supabase backend | - |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key, server-side only | For Supabase backend | - |
| `SCREENER_FILE_MODE_STRICT` | Disable on-demand fallback in file mode when set to `1` | No | `1` for VPS |
| `SCREENER_API_RATE_LIMIT_PER_MINUTE` | Request limit per client per minute | No | `30` |
| `SCREENER_SYMBOLS` | Comma-separated symbol override, e.g. `BTCUSDT,ETHUSDT`; empty uses top 100 Binance USDT perpetuals | No | Top 100 universe |
| `SCREENER_MAX_SYMBOLS` | Max symbols for screener | No | `100` for VPS |
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
| `npm run screener` | Run screener loop |
| `npm run screener -- --once` | Run one screener cycle and exit |
| `npm run agent` | Run AI Signal Agent against latest screener snapshot |
| `npm run worker` | Run Telegram alert worker |

## Futures Screener

### Running the Screener

```bash
# Run once, persist output, then exit
npm run screener -- --once

# Run continuously
npm run screener

# Show help
npm run screener -- --help
```

### Storage

The screener writes runtime data to `data/screener/`:

| File | Description |
|---|---|
| `latest.json` | Latest screener snapshot, written atomically |
| `history.jsonl` | Append-only run summaries |
| `alerts.jsonl` | Append-only alert policy records |
| `settings.json` | Rank and alert settings, written atomically |

When `SCREENER_STORAGE_MODE=file`, `/api/screener` reads `latest.json`. If the snapshot is missing, the API falls back to on-demand mode unless `SCREENER_FILE_MODE_STRICT=1` is set.

### API Modes

| Mode | Description | Recommended Use |
|---|---|---|
| `file` | Serve persisted worker/scheduler output | VPS, cPanel, long-running Node server |
| `on-demand` | Run screener during API request | Development, simple serverless setup |

Recommended production setup:

```env
SCREENER_STORAGE_MODE=file
DISABLE_SCREENER_SCHEDULER=1
```

Generate the first snapshot:

```bash
npm run screener -- --once
```

Strict file-only mode:

```env
SCREENER_FILE_MODE_STRICT=1
```

### Default Alert Rules

| Setting | Default |
|---|---|
| Alerts enabled | `false` |
| Min confidence | `75` |
| Min grade | `B` |
| Min risk-reward | `1.5` |
| Max alerts per hour | `10` |
| Cooldown per symbol/action | `10` minutes |
| Send WAIT alerts | `false` |
| Top N only | `5` |

Alerts are blocked for stale data, insufficient data, duplicate symbol/action during cooldown, and hourly caps.

## AI Signal Agent

The AI Signal Agent reads the latest screener snapshot and generates read-only decision-support summaries.

Safety rules:

- Does not execute trades.
- Does not request exchange API keys.
- Does not change deterministic `LONG`, `SHORT`, or `WAIT` decisions.
- Rejects risky AI output containing leverage, all-in sizing, API key requests, guaranteed profit, or equivalent claims.

Prepare a snapshot:

```bash
npm run screener -- --once
```

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
├── scripts/                 # TypeScript scripts for screener, worker, and agent
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
npm run build
npm run screener -- --once
npm run start:prod
```

For production deployments with separate long-running processes, run the screener and worker under a process manager such as PM2 or systemd:

```bash
npm run screener
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
