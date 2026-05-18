# Crypto Market Dashboard

## Deskripsi Singkat

Crypto Market Dashboard adalah aplikasi dashboard crypto berbasis **Next.js** untuk memantau market **Binance USDⓈ-M Futures** secara real time. Aplikasi ini menyediakan chart candlestick, technical analysis, futures signal engine, AI technical summary, watchlist, alert, dan signal journal untuk membantu proses analisis market secara lebih disiplin.

> Aplikasi ini hanya untuk edukasi, analisis, dan journaling. Bukan financial advice.

## Fitur Utama

- **Realtime Futures Market**
  - Harga Binance USDⓈ-M Futures secara real time via WebSocket.
  - Data 24h change, volume, dan market movement.
  - Search coin dan market overview responsif.

- **Chart & Technical Analysis**
  - Candlestick chart menggunakan TradingView Lightweight Charts.
  - Data OHLCV dari Binance Futures Kline API.
  - Mode chart clean dan technical.
  - Indikator EMA, RSI, MACD, ATR, ADX, Fibonacci, support/resistance, order block, dan trend/regime detector.

- **Futures Signal Engine**
  - Rekomendasi `LONG`, `SHORT`, atau `WAIT` berbasis risk-first decision engine.
  - Entry zone, stop loss, take profit, risk:reward ratio, confidence score, signal grade, dan suggested leverage.
  - Filter tambahan seperti multi-timeframe confirmation, funding rate, open interest, liquidity sweep, dan no-trade risk guard.

- **Signal Journal**
  - Halaman khusus `/journal` untuk menyimpan dan mengevaluasi signal.
  - Tampilan card-based journal.
  - Tracking status signal: pending, TP1, TP2, TP3, SL, expired, dan cancelled.
  - Realtime PnL percentage, MFE, MAE, win rate, loss rate, dan statistik LONG/SHORT.

- **AI Technical Agent**
  - AI summary dan chat berbasis OpenAI-compatible API.
  - Streaming response.
  - API key input dimasking dan persistensi key bersifat opsional.

- **Watchlist, Alerts, dan Sentiment**
  - Watchlist lokal berbasis browser storage.
  - Alert lokal untuk kondisi market/signal.
  - Fear & Greed Index dari Alternative.me.
  - Metadata coin dari CoinGecko.

## Tech Stack

### Frontend

- **Next.js 16** — App Router framework.
- **React 19** — UI rendering.
- **TypeScript 6** — static typing.
- **Tailwind CSS 4** — styling dan design tokens.

### Data & State

- **Zustand 5** — client-side state management dan local persistence.
- **TanStack Query 5** — server-state fetching dan caching.
- **Binance USDⓈ-M Futures API** — market price, kline, funding rate, dan open interest.
- **CoinGecko API** — metadata coin.
- **Alternative.me API** — Fear & Greed Index.

### Chart & UI

- **TradingView Lightweight Charts 5.2** — candlestick dan volume chart.
- **Lucide React** — icon set.
- **Project CSS/Tailwind classes** — dark technical-terminal visual system.

### Tooling

- **ESLint 10** — linting.
- **Prettier 3** — formatting.
- **TypeScript compiler** — type checking.
- **Vitest 3** — tersedia di script, test files saat ini sudah dihapus.

## Cara Install dan Run

### Prasyarat

- Node.js 20+ direkomendasikan.
- npm 10+ direkomendasikan.
- Koneksi internet untuk Binance, CoinGecko, Alternative.me, dan optional AI provider.

### Install Dependency

```bash
npm install
```

### Jalankan Development Server

```bash
npm run dev
```

Buka aplikasi di browser:

```txt
http://localhost:3000
```

### Build Production

```bash
npm run build
```

### Jalankan Production Server

```bash
npm start
```

Atau jalankan lokal di port 3000:

```bash
npm run start:local
```

## Script Penting

| Script | Fungsi |
|---|---|
| `npm run dev` | Menjalankan development server dengan Webpack |
| `npm run dev:turbo` | Menjalankan development server dengan Turbopack |
| `npm run build` | Build production dengan Webpack |
| `npm run build:turbo` | Build production dengan Turbopack |
| `npm start` | Menjalankan production server |
| `npm run start:local` | Menjalankan production server di port 3000 |
| `npm run typecheck` | Validasi TypeScript |
| `npm run lint` | Menjalankan ESLint |
| `npm run screener` | Menjalankan screener long-running loop |
| `npm run screener -- --once` | Single-shot screener evaluation |

## Futures Screener

### Running the Screener

```bash
# Single-shot: evaluate all 10 symbols, persist results, exit
npm run screener -- --once

# Long-running: evaluate every 15 minutes with graceful shutdown
npm run screener

# Help
npm run screener -- --help
```

### Data Storage

The screener persists data to `data/screener/`:

| File | Purpose |
|------|---------|
| `latest.json` | Most recent run snapshot (atomic write) |
| `history.jsonl` | Append-only run summaries |
| `alerts.jsonl` | Append-only alert policy decisions |
| `settings.json` | User alert/rank settings (atomic write) |

Missing files return safe defaults — the UI can always render an empty state.

### Alert Rules (Defaults)

| Setting | Default |
|---------|---------|
| Alerts enabled | `false` (opt-in) |
| Min confidence | 75% |
| Min grade | B |
| Min risk:reward | 1.5 |
| Cooldown per symbol/action | 60 minutes |
| Max alerts per hour | 3 |
| Send WAIT alerts | `false` |
| Top N only | 3 |

Alerts are suppressed for stale data, insufficient data, duplicate symbol/action within cooldown, and hourly caps. Material changes (grade improvement, confidence +10) can override cooldown.

### AI Auditor (Optional)

The screener supports optional AI auditing of top candidates. AI audits are **commentary only** — they never determine LONG/SHORT/WAIT and never invent price levels.

Limitations:
- Requires an OpenAI-compatible API key configured in the app.
- If AI is not configured or the request fails, the screener works without audit.
- AI output is schema-validated; malformed responses are rejected.
- Audits are cached by (symbol, action, candleCloseTime) to avoid redundant API cost.

### Risk Disclaimer

> **This is educational decision-support software, not financial advice.**
> Signals are deterministic outputs from technical analysis, never guarantees of price movement.
> Confidence scores reflect setup quality, not win probability.
> WAIT is a valid analysis outcome, not an error.

## Deployment Singkat

Project menggunakan konfigurasi Next.js standalone output:

```ts
output: 'standalone'
```

Konfigurasi ini membantu deployment ke hosting Node.js seperti cPanel Node.js hosting karena output production lebih ringkas dan berisi file yang dibutuhkan untuk menjalankan server.
