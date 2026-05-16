# Crypto Market Dashboard

A premium frontend-first crypto market dashboard for monitoring Binance USDⓈ-M Futures markets in real time. The app combines live market data, professional TradingView Lightweight Charts, technical analysis indicators, AI-assisted summaries, watchlists, alerts, and sentiment widgets in a dark technical-terminal interface.

## Features

### Market Monitoring

- Real-time Binance Futures market prices using WebSocket streams.
- 24h price change, volume, and market movement indicators.
- Global coin search and responsive market overview.
- Dynamic symbol handling for coins with USDT perpetual pairs.
- Market pulse / connection status for WebSocket reliability visibility.

### Coin Detail & Charts

- Coin detail page with live price, change, and market stats.
- TradingView Lightweight Charts v5 candlestick chart.
- Historical OHLCV candles from Binance Futures Kline API.
- Clean Mode for price action only.
- Technical Mode for overlays and indicators.
- Incremental chart updates for stable high-frequency rendering.
- Empty, loading, and error states for chart data.

### Technical Analysis

- Moving average overlays.
- RSI status.
- MACD and histogram signal.
- Support and resistance detection.
- Fibonacci retracement levels.
- Order block detection.
- Trend label with bullish, bearish, sideways, or insufficient-data states.
- Bounded indicator calculation window for better main-thread performance.

### AI Agent

- OpenAI-compatible AI configuration.
- AI technical summary generated from current indicator context.
- AI chat panel for contextual market questions.
- Streaming chat response support.
- Copy, retry, loading, and error states for AI summary.
- Local persisted AI configuration.

### Watchlist, Alerts, and Sentiment

- Local watchlist backed by browser storage.
- Browser-side alert storage for MVP usage.
- Fear & Greed Index from Alternative.me.
- Coin metadata enrichment from CoinGecko.

### Quality & Architecture

- Clean separation between UI, adapters, stores, and pure domain logic.
- Pure chart transform layer with Vitest coverage.
- Binance response normalizers to prevent raw API payloads leaking into UI.
- Typed domain models for candles, chart data, and technical analysis results.
- TypeScript, ESLint, and Vitest validation scripts.

## Tech Stack

### Core

- **Next.js 16** — App Router application framework.
- **React 19** — UI rendering.
- **TypeScript 6** — static typing.
- **Tailwind CSS 4** — utility-first styling and design tokens.

### Data & State

- **Zustand 5** — client state management and local persistence.
- **TanStack Query 5** — server-state fetching, caching, stale time, and refetching.
- **Binance USDⓈ-M Futures API** — live futures prices and historical kline data.
- **CoinGecko API** — coin metadata enrichment.
- **Alternative.me API** — Fear & Greed Index.

### Charts & UI

- **TradingView Lightweight Charts 5.2** — candlestick, volume, and technical charting.
- **Lucide React** — icons.
- **Vanilla/Tailwind CSS classes** — project-level visual system.

### AI

- **OpenAI-compatible chat completion API** — configurable base URL, API key, and model.
- **Streaming chat support** — incremental assistant responses.

### Tooling

- **ESLint 10** — linting.
- **Prettier 3** — formatting.
- **Vitest 3** — unit tests for pure transformation logic.
- **V8 coverage** — test coverage provider.

## Installation

### Prerequisites

- Node.js 20+ recommended.
- npm 10+ recommended.
- Internet access for Binance, CoinGecko, Alternative.me, and optional AI provider APIs.

### Setup

```bash
npm install
```

### Run Development Server

```bash
npm run dev
```

Open the app at:

```txt
http://localhost:3000
```

Alternative Turbopack dev server:

```bash
npm run dev:turbo
```

### Production Build

```bash
npm run build
npm start
```

### Local Production Start on Port 3000

```bash
npm run start:local
```

## Quality Checks

Run the smallest meaningful checks before committing changes:

```bash
npm run typecheck
npm run lint
npm test
```

Available scripts:

| Script | Purpose |
|---|---|
| `npm run dev` | Start Next.js development server with webpack |
| `npm run dev:turbo` | Start Next.js development server with Turbopack |
| `npm run build` | Build production app with webpack |
| `npm run build:turbo` | Build production app with Turbopack |
| `npm start` | Start production server |
| `npm run start:local` | Start production server on port 3000 |
| `npm run typecheck` | Run TypeScript validation |
| `npm run lint` | Run ESLint on `src/` |
| `npm test` | Run Vitest unit tests |
| `npm run test:watch` | Run Vitest in watch mode |

## AI Configuration

The AI Agent is optional. Configure it from the app UI with:

- OpenAI-compatible base URL.
- API key.
- Model name.

Secrets are stored locally in the browser for MVP usage. Do not use shared machines for private API keys.

## Project Structure

```txt
src/
  app/                    # Next.js routes and page composition
  components/             # UI components by product area
    ai-agent/             # AI chat and summary UI
    chart/                # Lightweight Charts components
    technical-analysis/   # Indicator panels and displays
  lib/
    ai/                   # AI client and prompt builder
    api/                  # REST data adapters
    binance/              # Binance Futures client, types, normalizers
    chart/                # Pure chart data transformations and tests
    indicators/           # Pure technical analysis calculations
    registry/             # Coin registry and symbol mapping
    websocket/            # Binance WebSocket hooks
  stores/                 # Zustand stores
  types/                  # Shared TypeScript models
```

## Architecture Notes

The app follows a frontend-oriented Clean Architecture Lite approach:

- UI components render state and user interaction only.
- Adapters in `src/lib/api`, `src/lib/binance`, and `src/lib/ai` isolate external services.
- Pure domain logic lives in `src/lib/indicators` and `src/lib/chart`.
- Zustand stores act as client-side repositories for live prices, watchlists, alerts, and AI settings.
- Raw external API responses are normalized before they reach UI components.

## Notes

- Market data depends on third-party API availability and rate limits.
- This dashboard provides informational market data and technical indicators only.
- It is not financial advice. Always do your own research before trading.
