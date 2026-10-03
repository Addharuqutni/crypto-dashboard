# Crypto Market Dashboard

Dashboard analisis pasar crypto berbasis **Next.js App Router** untuk memantau **Binance USDⓈ-M Futures** secara real time.

Arsitekturnya dua bagian:

- **Next.js** — UI, API routes (BFF), dan penyimpanan data.
- **Python Action Call** — **satu-satunya** engine sinyal dan screener (FastAPI).

Fitur: market overview, candlestick chart, technical analysis, screener, AI commentary, signal journal, watchlist, alert lokal, dan worker Telegram.

> **Disclaimer:** Project ini dibuat untuk edukasi, analisis, dan journaling. Bukan financial advice, bukan sinyal pasti, dan bukan jaminan profit.

## Quick Start

Cara tercepat menjalankan di lokal:

```bash
# 1. Install dependency
npm install

# 2. Siapkan environment (Windows CMD: copy .env.example .env.local)
cp .env.example .env.local

# 3. Jalankan dashboard
npm run dev
```

Buka <http://localhost:3000>. Data harga, chart, dan market overview langsung jalan tanpa setup tambahan.

**Untuk screener dan sinyal**, service Python harus hidup — jalankan di terminal terpisah:

```bash
npm run python-agent        # Linux/macOS
npm run python-agent:win    # Windows (PowerShell)
```

Saat pertama dijalankan, script ini otomatis membuat venv di `agent/.venv/` dan menginstall `agent/requirements.txt`. Butuh **Python 3**.

> Ringkasnya: tanpa Python → dashboard tetap jalan, tapi `/api/screener` dan `/api/action-call` tidak punya data.

## Cara Kerja

```text
Browser (React UI)
   │  fetch /api/*
   ▼
Next.js  ──  App Router pages + BFF API routes
   │  proxy ke PYTHON_AGENT_URL
   ▼
Python Action Call  ──  FastAPI di 127.0.0.1:8000
   └─ engine tunggal untuk sinyal & screener
```

Prinsip yang berlaku di seluruh project:

- Python Action Call adalah **satu-satunya** engine sinyal dan screener.
- AI **hanya menjelaskan atau mengaudit** — tidak pernah menimpa keputusan Python.
- Signal bersifat **deterministik** (hasil technical analysis), bukan prediksi.
- Worker Telegram hanya mengirim notifikasi; ia tidak mengambil keputusan trading.

## Table of Contents

- [Quick Start](#quick-start)
- [Cara Kerja](#cara-kerja)
- [Features](#features)
- [Tech Stack](#tech-stack)
- [Requirements](#requirements)
- [Installation](#installation)
- [Environment Variables](#environment-variables)
- [Development](#development)
- [Scripts](#scripts)
- [Python Screener](#python-screener)
- [AI Signal Agent](#ai-signal-agent)
- [Telegram Worker](#telegram-worker)
- [Project Structure](#project-structure)
- [Quality Checks](#quality-checks)
- [Deployment](#deployment)
- [Security Notes](#security-notes)
- [Risk Notes](#risk-notes)

## Features

### Market Dashboard

- Harga Binance USDⓈ-M Futures real time via WebSocket.
- Perubahan 24 jam, volume, pergerakan pasar, dan market overview.
- Pencarian coin dan UI responsif untuk desktop serta mobile.

### Chart & Technical Analysis

- Candlestick dan volume chart menggunakan TradingView Lightweight Charts.
- Data OHLCV dari Binance Futures.
- Mode chart clean dan technical.
- EMA, RSI, MACD, ATR, ADX, Fibonacci, support/resistance, order block, liquidity sweep, trend, dan regime detection.

### Python Action Call dan Screener

- Python FastAPI sebagai satu-satunya engine sinyal dan screener.
- Action call multi-timeframe menghasilkan entry, stop loss, take profit, risk-reward, confidence, dan konteks pasar.
- Pemilihan universe Binance USDⓈ-M dinamis, dengan opsi override symbol.
- Route `/api/action-call` dan `/api/screener` di Next.js mem-proxy service internal.
- Opsional: dataset JSON/JSONL lokal dan pengiriman via Telegram.

### AI Tools

- Technical summary dan chat yang kompatibel dengan OpenAI.
- Opsional: streaming response.
- Opsional: penyimpanan API key di sisi client.
- Server-side AI Signal Agent untuk ringkasan decision-support (read-only).

### Journal, Watchlist, dan Alerts

- Signal journal dengan pelacakan status: pending, TP1, TP2, TP3, SL, expired, cancelled.
- Metrik PnL, MFE, MAE, win rate, loss rate, dan distribusi LONG/SHORT.
- Watchlist dan alert tersimpan di browser (local).
- Worker Telegram untuk pengiriman alert eksternal (opsional).

## Tech Stack

| Area | Teknologi |
|---|---|
| Framework | Next.js 16 (App Router, Turbopack) |
| UI | React 19, Tailwind CSS 4, Lucide React |
| Bahasa | TypeScript 6 |
| State | Zustand 5, TanStack Query 5 |
| Charts | TradingView Lightweight Charts 5 |
| Storage (opsional) | Supabase (`@supabase/supabase-js`) |
| Sinyal & Screener | Python 3 (FastAPI, ccxt, pandas) |
| Testing | Vitest 4 (unit/integration), Playwright (e2e) |
| Tooling | ESLint 10, tsx |
| Data Sources | Binance Futures API, CoinGecko API, Alternative.me API |

## Requirements

- Node.js `>=22.0.0`
- npm `>=10.0.0`
- **Python 3** (untuk Python Action Call service — otomatis membuat venv saat pertama dijalankan)
- Internet access ke Binance, CoinGecko, Alternative.me, dan provider AI (opsional)
- Telegram bot token dan chat ID, hanya jika ingin alert Telegram

## Installation

```bash
npm install
```

Service Python tidak perlu diinstall manual — `npm run python-agent` membuat venv dan menginstall dependency-nya sendiri.

## Environment Variables

Buat file environment dari template yang di-commit:

```bash
cp .env.example .env.local
```

Windows Command Prompt:

```cmd
copy .env.example .env.local
```

Next.js dan Python agent sama-sama membaca root `.env.local`. Referensi lengkap ada di [`docs/ENV.md`](docs/ENV.md); tabel di bawah hanya variabel yang paling sering diubah.

### Application

| Variable | Description | Required | Default |
|---|---|---:|---|
| `BASIC_AUTH_ENABLED` | Aktifkan Basic Auth jika diisi `1` | No | Disabled |
| `BASIC_AUTH_USER` | Username Basic Auth | Jika auth aktif | - |
| `BASIC_AUTH_PASSWORD` | Password Basic Auth | Jika auth aktif | - |
| `TRUST_PROXY` | Jika `1`, rate limit memakai `X-Real-IP` / hop terakhir `X-Forwarded-For`. **Set hanya di belakang nginx** | No | `0` |

### Screener API

| Variable | Description | Required | Default |
|---|---|---:|---|
| `SCREENER_STORAGE_MODE` | Mode `/api/screener`: `file` (baca snapshot) atau `on-demand` (jalankan cycle baru per request) | No | `file` |
| `SCREENER_STORAGE_BACKEND` | Backend storage: `supabase` atau `file` | No | `file` |
| `SCREENER_REQUIRE_DATABASE` | Jika `1`, wajib pakai database dan melarang fallback file | No | `0` |
| `CRON_SECRET` | Bearer token untuk `GET /api/cron/screener` dan `POST /api/action-call` | Ya untuk cron | - |
| `SCREENER_FILE_MODE_STRICT` | Jika `1`, matikan fallback on-demand saat snapshot file tidak ada | No | `1` |
| `SCREENER_API_RATE_LIMIT_PER_MINUTE` | Batas request per client per menit | No | `30` |
| `SCREENER_UNIVERSE_MODE` | Mode universe: `top_futures_volume` (rangking perpetual USDT linear aktif berdasarkan volume quote 24 jam) | No | `top_futures_volume` |
| `SCREENER_SYMBOLS` | Override symbol, mis. `BTCUSDT,ETHUSDT`. Jika diisi, resolusi dinamis dilewati | No | Kosong (top-100 dinamis) |
| `SCREENER_MAX_SYMBOLS` | Batas jumlah symbol di universe | No | `100` |
| `SCREENER_UNIVERSE_CACHE_TTL_MINUTES` | TTL cache in-process untuk resolusi universe dinamis | No | `30` |
| `SCREENER_CANDLE_LIMIT` | Batas candle per symbol | No | `120` |
| `SCREENER_MAX_CONCURRENT_SYMBOLS` | Concurrency per symbol | No | `3` |
| `SCREENER_INTERVAL_MINUTES` | Interval cycle screener (`1`–`1440`) | No | `15` |
| `INCLUDE_STABLECOINS` | Jika `true`, izinkan base stablecoin (USDC, FDUSD, …) di universe dinamis | No | `false` |
| `DISABLE_SCREENER_SCHEDULER` | Jika `1`, matikan scheduler in-process Next.js | No | `0` (dev), `1` (VPS) |
| `NEXT_PUBLIC_SUPABASE_URL` | URL project Supabase | Untuk backend Supabase | - |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key Supabase, server-side saja | Untuk backend Supabase | - |

### Python Action Call

| Variable | Description | Required | Default |
|---|---|---:|---|
| `PYTHON_AGENT_URL` | URL service Python internal | No | `http://127.0.0.1:8000` |
| `PYTHON_AGENT_INTERNAL_TOKEN` | Shared secret Next.js → Python, wajib untuk route analyze/scan/export | Ya untuk Python API | - |

### AI Provider

| Variable | Description | Required |
|---|---|---:|
| `AI_BASE_URL` | Base URL kompatibel OpenAI. URL remote wajib HTTPS. | Untuk server-side AI |
| `AI_API_KEY` | API key provider AI | Untuk server-side AI |
| `AI_MODEL` | Nama model AI | Untuk server-side AI |

### Telegram Worker

| Variable | Description | Required |
|---|---|---:|
| `TELEGRAM_BOT_TOKEN` | Bot token Telegram | Untuk pengiriman Telegram |
| `TELEGRAM_CHAT_ID` | Chat/channel ID tujuan | Untuk pengiriman Telegram |
| `WORKER_SYMBOLS` | Daftar symbol dipisah koma | No |
| `WORKER_INTERVAL_MIN` | Interval worker (menit) | No |
| `WORKER_SETUP_TF` | Timeframe setup utama | No |
| `WORKER_MACRO_TF` | Timeframe konfirmasi makro | No |
| `WORKER_TRIGGER_TF` | Timeframe trigger | No |
| `WORKER_ALERT_COOLDOWN_MIN` | Cooldown alert per symbol/action | No |
| `WORKER_MIN_CONFIDENCE` | Confidence minimum untuk alert | No |
| `WORKER_SEND_WAIT_ALERTS` | Kirim alert `WAIT` | No |
| `WORKER_SEND_HEALTH_ALERTS` | Kirim alert kesehatan worker | No |
| `WORKER_HEALTH_ALERTS_PER_HOUR` | Batas rate alert kesehatan | No |
| `WORKER_DATA_DIR` | Direktori state worker | No |
| `WORKER_CONTINUE_ON_TELEGRAM_FAILURE` | Lanjutkan loop worker saat pengiriman Telegram gagal | No |

> Jangan pernah commit `.env.local`, API key, token Telegram, atau credential privat apa pun.

## Development

```bash
npm run dev          # Turbopack
npm run dev:webpack  # Webpack (jika ada masalah dengan Turbopack)
```

Buka <http://localhost:3000>.

Untuk pengalaman penuh (screener + sinyal), jalankan service Python di terminal terpisah:

```bash
npm run python-agent
```

## Scripts

| Script | Description |
|---|---|
| `npm run dev` | Development server dengan Turbopack |
| `npm run dev:webpack` | Development server dengan Webpack |
| `npm run build` | Build production dengan Turbopack |
| `npm run build:webpack` | Build production dengan Webpack |
| `npm start` | Server production Next.js standar |
| `npm run start:local` | Server production di port 3000 |
| `npm run start:prod` | Server standalone (menyiapkan `.next/standalone` lalu menjalankannya) |
| `npm run lint` | ESLint untuk `src/` |
| `npm run typecheck` | Type check TypeScript tanpa emit |
| `npm run test` | Vitest suite (sekali jalan) |
| `npm run test:watch` | Vitest watch mode |
| `npm run test:e2e` | Playwright end-to-end test |
| `npm run check` | `typecheck` + `lint` + `test` |
| `npm run clean` | Hapus artifact build dan test lokal |
| `npm run audit:prod` | Audit dependency production |
| `npm run python-agent` | Jalankan Python Action Call service (Linux/macOS) |
| `npm run python-agent:win` | Jalankan Python Action Call service (Windows) |
| `npm run agent` | Jalankan TypeScript AI agent (opsional) |
| `npm run worker` | Jalankan worker alert Telegram |
| `npm run deploy:vps` | Deploy ke VPS |
| `npm run run:vps` | Deploy dan opsional konfigurasi domain |
| `npm run setup:domain` | Konfigurasi nginx dan TLS (opsional) |

## Python Screener

Service Python Action Call yang memegang siklus screener:

```bash
npm run python-agent
```

Untuk dashboard API, set `MARKET_DATA_MODE=dashboard`. Secara default route `/api/screener` membaca snapshot Python terakhir; set `SCREENER_STORAGE_MODE=on-demand` untuk meminta run baru setiap request. Route cron memicu scan Python dengan autentikasi `CRON_SECRET`.

Service Python menyimpan dataset di `agent/datasets/` dan menyediakan endpoint internal seperti `/api/v1/screener/latest` dan `/api/v1/screener/run`. **Di production, selalu bind service ke localhost.**

## AI Signal Agent

TypeScript AI agent (opsional) membaca data screener/action-call Python terakhir dan menghasilkan ringkasan decision-support yang bersifat read-only.

Aturan keamanan:

- Tidak mengeksekusi trade.
- Tidak meminta API key exchange.
- Tidak menimpa keputusan action-call Python.
- Menolak output AI yang mengandung leverage, sizing all-in, permintaan API key, klaim profit pasti, atau sejenisnya.

Jalankan:

```bash
npm run agent
```

Jika `AI_BASE_URL`, `AI_API_KEY`, dan `AI_MODEL` tidak dikonfigurasi, agent tetap mengembalikan keputusan deterministik tanpa enrichment AI.

## Telegram Worker

```bash
npm run worker
```

Langkah setup:

1. Buat bot Telegram via BotFather.
2. Salin bot token ke `TELEGRAM_BOT_TOKEN`.
3. Set chat/channel tujuan di `TELEGRAM_CHAT_ID`.
4. Konfigurasi variabel worker opsional di `.env.local`.
5. Jalankan dengan `npm run worker`.

Worker bisa jalan tanpa credential Telegram untuk update state lokal, tetapi pengiriman eksternal akan dinonaktifkan.

## Project Structure

```text
crypto-dashboard/
├── agent/                   # Python Action Call service dan screener
├── data/                    # Data runtime lokal untuk screener dan worker
├── deploy/                  # Helper deployment VPS, cPanel, dan nginx
├── e2e/                     # Playwright end-to-end test
├── scripts/                 # Script runtime untuk worker, agent, dan deployment
├── src/
│   ├── app/                 # Halaman App Router dan API routes
│   ├── components/          # Komponen UI
│   ├── hooks/               # React hooks
│   ├── lib/                 # Layer domain, application, adapter, dan shared
│   ├── stores/              # Zustand stores
│   └── types/               # TypeScript types bersama
├── .env.example             # Template environment
├── next.config.ts           # Konfigurasi Next.js
├── package.json             # Script dan dependency
├── tsconfig.json            # Konfigurasi TypeScript
└── vitest.config.ts         # Konfigurasi Vitest
```

Layer di `src/lib/`:

```text
domain/       Logika bisnis murni (signals, indicators, intelligence) — tanpa I/O
application/  Use-case, worker, orkestrasi screener
adapters/     I/O eksternal (Binance, AI, storage, websocket)
shared/       Helper lintas-cutting (formatting, a11y, security)
```

## Quality Checks

Jalankan semua check sebelum deploy atau perubahan besar:

```bash
npm run typecheck
npm run lint
npm run test
npm run build
```

Atau singkatnya:

```bash
npm run check
```

Smoke test production standalone:

```bash
npm run build
npm run start:prod
```

## Deployment

Project memakai Next.js standalone output (`output: 'standalone'`).

Alur minimal:

```bash
npm install
cp .env.example .env.local
npm run build

# Terminal 1 — service sinyal (proses foreground)
npm run python-agent

# Terminal 2 — server production
npm run start:prod
```

Untuk production, jalankan service Python dan worker di bawah process manager seperti PM2 atau systemd — jangan biarkan sebagai proses foreground.

Setup VPS lengkap (build, PM2, nginx, TLS) ada di [`docs/VPS_DEPLOYMENT.md`](docs/VPS_DEPLOYMENT.md) dan [`docs/RUNBOOK.md`](docs/RUNBOOK.md):

```bash
npm run run:vps      # bring-up pertama + domain opsional
npm run deploy:vps   # redeploy setelah git pull
```

## Security Notes

- Jauhkan `.env.local` dan file credential apa pun dari version control.
- Aktifkan `BASIC_AUTH_ENABLED=1` untuk deployment privat.
- Utamakan credential AI di sisi server melalui `AI_BASE_URL`, `AI_API_KEY`, dan `AI_MODEL`.
- Hindari menyimpan API key provider AI di local storage browser pada mesin publik atau bersama.
- Jangan pernah mengekspos API key trading exchange ke dashboard atau AI agent.
- Di production, bind Python service ke `127.0.0.1` dan set `TRUST_PROXY=1` hanya di belakang reverse proxy tepercaya.

## Risk Notes

- Signal adalah output technical analysis yang deterministik, bukan prediksi.
- Confidence score mengukur kualitas setup, bukan probabilitas menang.
- `WAIT` adalah keputusan risk-first yang valid.
- Selalu gunakan penilaian independen, position sizing, stop loss, dan manajemen risiko.
- Verifikasi kondisi pasar terkini sebelum mengambil keputusan trading.
