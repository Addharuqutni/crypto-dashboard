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

## Deployment Singkat

Project menggunakan konfigurasi Next.js standalone output:

```ts
output: 'standalone'
```

Konfigurasi ini membantu deployment ke hosting Node.js seperti cPanel Node.js hosting karena output production lebih ringkas dan berisi file yang dibutuhkan untuk menjalankan server.
