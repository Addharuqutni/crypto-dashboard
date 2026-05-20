# Crypto Market Dashboard

Crypto Market Dashboard adalah aplikasi dashboard analisis crypto berbasis **Next.js App Router** untuk memantau market **Binance USDⓈ-M Futures** secara real time. Aplikasi ini menggabungkan market overview, candlestick chart, technical analysis, futures signal engine, AI technical summary, watchlist, alert, journal, screener, dan worker Telegram untuk membantu proses analisis yang lebih disiplin.

> **Disclaimer:** Aplikasi ini dibuat untuk edukasi, analisis, dan journaling. Ini bukan financial advice, bukan sinyal pasti, dan bukan jaminan profit.

## Daftar Isi

- [Fitur Utama](#fitur-utama)
- [Tech Stack](#tech-stack)
- [Prasyarat](#prasyarat)
- [Instalasi](#instalasi)
- [Menjalankan Aplikasi](#menjalankan-aplikasi)
- [Script Penting](#script-penting)
- [Environment Variable](#environment-variable)
- [Futures Screener](#futures-screener)
- [Worker Alert Telegram](#worker-alert-telegram)
- [Struktur Project](#struktur-project)
- [Quality Check](#quality-check)
- [Deployment Singkat](#deployment-singkat)
- [Catatan Risiko](#catatan-risiko)

## Fitur Utama

### Realtime Futures Market

- Harga Binance USDⓈ-M Futures secara real time melalui WebSocket.
- Data 24h change, volume, market movement, dan market overview.
- Search coin dan UI responsif untuk analisis cepat.

### Chart & Technical Analysis

- Candlestick chart menggunakan TradingView Lightweight Charts.
- Data OHLCV dari Binance Futures Kline API.
- Mode chart clean dan technical.
- Indikator EMA, RSI, MACD, ATR, ADX, Fibonacci, support/resistance, order block, liquidity sweep, dan trend/regime detector.

### Futures Signal Engine

- Rekomendasi `LONG`, `SHORT`, atau `WAIT` berbasis risk-first decision engine.
- Entry zone, stop loss, take profit, risk:reward ratio, confidence score, signal grade, dan suggested leverage.
- Guard tambahan untuk multi-timeframe confirmation, funding rate, open interest, liquidity sweep, stale data, dan no-trade risk.

### Signal Journal

- Halaman `/journal` untuk menyimpan dan mengevaluasi signal.
- Tampilan card-based journal.
- Tracking status signal: pending, TP1, TP2, TP3, SL, expired, dan cancelled.
- Statistik PnL percentage, MFE, MAE, win rate, loss rate, serta distribusi LONG/SHORT.

### AI Technical Agent

- AI summary dan chat berbasis OpenAI-compatible API.
- Mendukung streaming response.
- API key input dimasking dan penyimpanan key bersifat opsional.
- AI bersifat commentary only dan tidak menggantikan risk engine deterministik.

### Watchlist, Alerts, dan Sentiment

- Watchlist lokal berbasis browser storage.
- Alert lokal untuk kondisi market dan signal.
- Fear & Greed Index dari Alternative.me.
- Metadata coin dari CoinGecko.

### Screener & Worker

- Futures screener untuk evaluasi berkala beberapa symbol.
- Penyimpanan snapshot, history, dan alert decision dalam format JSON/JSONL.
- Worker opsional untuk mengirim alert Telegram berdasarkan rule yang terukur.

## Tech Stack

### Frontend

- **Next.js 16** — React framework dengan App Router.
- **React 19** — UI rendering.
- **TypeScript 6** — static typing.
- **Tailwind CSS 4** — styling dan design token.

### Data & State

- **Zustand 5** — client-side state management dan local persistence.
- **TanStack Query 5** — server-state fetching dan caching.
- **Binance USDⓈ-M Futures API** — price, kline, funding rate, dan open interest.
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
- **Vitest 3** — unit dan integration testing.
- **tsx** — menjalankan script TypeScript untuk screener dan worker.

## Prasyarat

- Node.js 20+ direkomendasikan.
- npm 10+ direkomendasikan.
- Koneksi internet untuk Binance, CoinGecko, Alternative.me, dan optional AI provider.
- Telegram bot token dan chat ID jika ingin memakai worker alert Telegram.

## Instalasi

```bash
npm install
```

## Menjalankan Aplikasi

### Development Server

```bash
npm run dev
```

### Development Server dengan Webpack

```bash
npm run dev:webpack
```

### Build Production

```bash
npm run build
```

### Build Production dengan Webpack

```bash
npm run build:webpack
```

### Production Server

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
| `npm run dev` | Menjalankan development server dengan Turbopack |
| `npm run dev:webpack` | Menjalankan development server dengan Webpack |
| `npm run build` | Build production dengan Turbopack |
| `npm run build:webpack` | Build production dengan Webpack |
| `npm start` | Menjalankan production server |
| `npm run start:local` | Menjalankan production server di port 3000 |
| `npm run lint` | Menjalankan ESLint untuk folder `src/` |
| `npm run typecheck` | Validasi TypeScript tanpa emit |
| `npm run test` | Menjalankan test dengan Vitest |
| `npm run test:watch` | Menjalankan Vitest watch mode |
| `npm run screener` | Menjalankan futures screener long-running loop |
| `npm run screener -- --once` | Menjalankan screener satu kali lalu exit |
| `npm run worker` | Menjalankan worker alert Telegram |

## Environment Variable

Project menggunakan `.env.local` untuk konfigurasi lokal. File ini tidak boleh di-commit karena dapat berisi secret.

Untuk worker Telegram, salin contoh konfigurasi:

```bash
copy .env.worker.example .env.local
```

Lalu isi nilai yang dibutuhkan:

| Variable | Fungsi | Wajib |
|---|---|---|
| `TELEGRAM_BOT_TOKEN` | Token bot Telegram untuk pengiriman alert | Untuk worker alert |
| `TELEGRAM_CHAT_ID` | Target chat/channel Telegram | Untuk worker alert |
| `WORKER_SYMBOLS` | Daftar symbol worker, contoh `BTCUSDT,ETHUSDT` | Tidak |
| `WORKER_INTERVAL_MIN` | Interval evaluasi worker dalam menit | Tidak |
| `WORKER_SETUP_TF` | Timeframe setup utama | Tidak |
| `WORKER_MACRO_TF` | Timeframe macro confirmation | Tidak |
| `WORKER_TRIGGER_TF` | Timeframe trigger | Tidak |
| `WORKER_ALERT_COOLDOWN_MIN` | Cooldown alert per symbol/action | Tidak |
| `WORKER_MIN_CONFIDENCE` | Minimum confidence untuk alert | Tidak |
| `WORKER_SEND_WAIT_ALERTS` | Mengirim alert WAIT atau tidak | Tidak |
| `WORKER_SEND_HEALTH_ALERTS` | Mengirim health alert worker | Tidak |
| `WORKER_DATA_DIR` | Folder penyimpanan state worker | Tidak |
| `WORKER_CONTINUE_ON_TELEGRAM_FAILURE` | Worker lanjut saat Telegram error | Tidak |

> Jangan pernah commit `.env.local`, token API, private key, atau credential lain.

## Futures Screener

### Menjalankan Screener

```bash
# Single-shot: evaluasi symbol, simpan hasil, lalu exit
npm run screener -- --once

# Long-running: evaluasi berkala dengan graceful shutdown
npm run screener

# Bantuan command
npm run screener -- --help
```

### Penyimpanan Data

Screener menyimpan data ke `data/screener/`:

| File | Fungsi |
|---|---|
| `latest.json` | Snapshot hasil run terbaru dengan atomic write |
| `history.jsonl` | Append-only summary setiap run |
| `alerts.jsonl` | Append-only keputusan policy alert |
| `settings.json` | Setting rank dan alert user dengan atomic write |

Jika file belum ada, sistem mengembalikan safe default agar UI tetap bisa menampilkan empty state.

### Default Alert Rules

| Setting | Default |
|---|---|
| Alerts enabled | `false` atau opt-in |
| Min confidence | 75% |
| Min grade | B |
| Min risk:reward | 1.5 |
| Cooldown per symbol/action | 60 menit |
| Max alerts per hour | 3 |
| Send WAIT alerts | `false` |
| Top N only | 3 |

Alert akan ditekan untuk stale data, insufficient data, duplicate symbol/action dalam cooldown, dan hourly cap. Material change seperti grade improvement atau confidence naik signifikan dapat melewati cooldown.

### AI Auditor Opsional

Screener mendukung AI audit untuk kandidat teratas. AI audit bersifat **commentary only**:

- Tidak menentukan `LONG`, `SHORT`, atau `WAIT`.
- Tidak boleh mengarang price level.
- Jika AI tidak dikonfigurasi atau request gagal, screener tetap berjalan tanpa audit.
- Output AI divalidasi dengan schema; response invalid akan ditolak.
- Audit di-cache berdasarkan symbol, action, dan candle close time untuk mengurangi biaya API.

## Worker Alert Telegram

Worker digunakan untuk menjalankan evaluasi berkala dan mengirim alert ke Telegram jika rule terpenuhi.

```bash
npm run worker
```

Sebelum menjalankan worker:

1. Buat bot Telegram melalui BotFather.
2. Ambil `TELEGRAM_BOT_TOKEN`.
3. Ambil `TELEGRAM_CHAT_ID` target.
4. Isi `.env.local` berdasarkan `.env.worker.example`.
5. Jalankan `npm run worker`.

Worker tetap dapat berjalan tanpa Telegram credential untuk menulis state lokal, tetapi status delivery akan dianggap disabled.

## Struktur Project

```txt
crypto-dashboard/
├── data/                    # Data runtime lokal untuk screener/worker
├── scripts/                 # Script TypeScript untuk screener dan worker
├── src/                     # Source code aplikasi
├── .env.worker.example      # Contoh konfigurasi worker Telegram
├── next.config.ts           # Konfigurasi Next.js
├── package.json             # Script dan dependency project
├── tsconfig.json            # Konfigurasi TypeScript
└── vitest.config.ts         # Konfigurasi Vitest
```

## Quality Check

Jalankan pemeriksaan berikut sebelum membuat perubahan besar atau deployment:

```bash
npm run typecheck
npm run lint
npm run test
```

Untuk validasi production build:

```bash
npm run build
```

## Deployment Singkat

Project menggunakan konfigurasi Next.js standalone output:

```ts
output: 'standalone'
```

Konfigurasi ini membantu deployment ke hosting Node.js seperti cPanel Node.js hosting karena output production lebih ringkas dan berisi file yang dibutuhkan untuk menjalankan server.

## Catatan Risiko

- Signal adalah output analisis teknikal deterministik, bukan prediksi pasti.
- Confidence score menggambarkan kualitas setup, bukan probabilitas menang.
- `WAIT` adalah hasil analisis valid, bukan error.
- Gunakan position sizing, stop loss, dan risk management secara disiplin.
- Selalu verifikasi kondisi market sebelum mengambil keputusan trading.
