# Environment Variables

<!-- AUTO-GENERATED: env-from-examples:start -->
Generated from `.env.example`, `agent/.env.example`, and `deploy/vps.env.example`.

## App and VPS runtime

| Variable | Required | Description | Example |
|----------|----------|-------------|---------|
| `NODE_ENV` | Yes in production | Runtime mode. | `production` |
| `PORT` | No | Web server port. | `3000` |
| `HOSTNAME` | No | Web server bind host. Keep local behind Nginx on VPS. | `127.0.0.1` |
| `DISABLE_SCREENER_SCHEDULER` | No | Disable in-app scheduler when screener runs separately. | `1` |
| `CRON_SECRET` | Yes for `/api/cron/screener` | Bearer token required by protected cron endpoint. | `change-this-long-random-secret` |
| `BASIC_AUTH_ENABLED` | No | Enable Basic Auth for private dashboards. | `1` |
| `BASIC_AUTH_USER` | Required when Basic Auth enabled | Basic Auth username. | `admin` |
| `BASIC_AUTH_PASSWORD` | Required when Basic Auth enabled | Basic Auth password. Use a long random value. | `change-this-long-random-password` |

## Screener storage and universe

| Variable | Required | Description | Example |
|----------|----------|-------------|---------|
| `SCREENER_STORAGE_MODE` | No | Screener read mode. `file` for VPS/production, `on-demand` for dev. | `file` |
| `SCREENER_STORAGE_BACKEND` | No | Storage backend. | `file` |
| `SCREENER_REQUIRE_DATABASE` | No | Require database-backed storage when `1`. | `0` |
| `SCREENER_FILE_MODE_STRICT` | No | Disable file-mode fallback to on-demand when `1`. | `1` |
| `SCREENER_SYMBOLS` | No | Comma-separated symbols. Empty uses built-in top Binance USDT perpetual universe. | `BTCUSDT,ETHUSDT` |
| `SCREENER_CANDLE_LIMIT` | No | Candles fetched per symbol. Clamped by route code. | `120` |
| `SCREENER_MAX_CONCURRENT_SYMBOLS` | No | Concurrent symbol scans. Clamped to safe range. | `3` |
| `SCREENER_MAX_SYMBOLS` | No | Maximum symbols to scan from built-in universe. | `100` |
| `SCREENER_API_RATE_LIMIT_PER_MINUTE` | No | Per-IP `/api/screener` request limit. | `120` |

## Supabase

| Variable | Required | Description | Example |
|----------|----------|-------------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | Required only for Supabase mode | Supabase project URL exposed to browser code. | `https://project.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | Required only for server Supabase writes | Server-side Supabase service role key. Never expose publicly. | `ey...` |

## Server-side AI

| Variable | Required | Description | Example |
|----------|----------|-------------|---------|
| `AI_BASE_URL` | Required when server AI enabled | OpenAI-compatible base URL. | `https://api.openai.com/v1` |
| `AI_API_KEY` | Required when server AI enabled | Provider API key. | `sk-...` |
| `AI_MODEL` | Required when server AI enabled | Provider model id. | `gpt-4o-mini` |

## Telegram worker alerts

| Variable | Required | Description | Example |
|----------|----------|-------------|---------|
| `TELEGRAM_BOT_TOKEN` | Required to send Telegram alerts | Telegram bot token. Empty disables delivery. | `123:abc` |
| `TELEGRAM_CHAT_ID` | Required to send Telegram alerts | Telegram chat/channel id. Empty disables delivery. | `123456789` |
| `WORKER_SYMBOLS` | No | Comma-separated symbols watched by worker. | `BTCUSDT,ETHUSDT,SOLUSDT` |
| `WORKER_INTERVAL_MIN` | No | Worker loop interval in minutes. | `15` |
| `WORKER_SETUP_TF` | No | Setup timeframe. | `30m` |
| `WORKER_MACRO_TF` | No | Macro timeframe. | `4h` |
| `WORKER_TRIGGER_TF` | No | Trigger timeframe. | `15m` |
| `WORKER_ALERT_COOLDOWN_MIN` | No | Alert cooldown window in minutes. | `60` |
| `WORKER_MIN_CONFIDENCE` | No | Minimum confidence for alerts. | `65` |
| `WORKER_SEND_WAIT_ALERTS` | No | Send WAIT-state alerts. | `false` |
| `WORKER_SEND_HEALTH_ALERTS` | No | Send health alerts. | `true` |
| `WORKER_HEALTH_ALERTS_PER_HOUR` | No | Max health alerts per hour. | `1` |
| `WORKER_DATA_DIR` | No | Worker state directory. | `./data/worker` |
| `WORKER_CONTINUE_ON_TELEGRAM_FAILURE` | No | Continue after Telegram delivery errors. | `true` |

## Python agent / dataset scanner

| Variable | Required | Description | Example |
|----------|----------|-------------|---------|
| `EXCHANGE` | No | Exchange id for Python agent scanner. | `binance` |
| `SYMBOLS` | No | Comma-separated ccxt-style pairs. | `BTC/USDT,ETH/USDT,SOL/USDT` |
| `TIMEFRAME` | No | OHLCV timeframe. | `1h` |
| `FETCH_LIMIT` | No | Candles fetched per symbol. | `250` |
| `SCAN_INTERVAL_SECONDS` | No | Scanner interval. | `3600` |
| `USE_BINANCE_TOP_VOLUME` | No | Scan Binance top volume pairs. | `true` |
| `BINANCE_TOP_VOLUME_LIMIT` | No | Number of top-volume pairs. | `100` |
| `BINANCE_TOP_VOLUME_QUOTE` | No | Quote asset filter. | `USDT` |
| `BINANCE_TOP_VOLUME_MARKET_TYPE` | No | Market type filter. | `spot` |
| `USE_TOP_MARKETCAP` | No | Use CoinGecko market-cap fallback. | `false` |
| `TOP_MARKETCAP_LIMIT` | No | CoinGecko market-cap symbol count. | `100` |
| `TOP_MARKETCAP_QUOTE` | No | Quote asset for market-cap fallback. | `USDT` |
| `INCLUDE_STABLECOINS` | No | Include stablecoins in market-cap fallback. | `false` |
| `SAVE_ACTION_DATASET` | No | Save action calls to JSONL/CSV datasets. | `true` |
| `DATABASE_ENABLED` | No | Enable Python agent database writes. | `false` |
| `DATABASE_URL` | Required when database enabled | PostgreSQL connection string. | `postgresql://crypto_agent:crypto_agent@localhost:5432/crypto_ai_agent` |
| `EVALUATION_FETCH_LIMIT` | No | Candles fetched for outcome evaluation. | `250` |
| `EVALUATION_MAX_ROWS` | No | Maximum dataset rows to evaluate. Empty means default/no cap. | `` |
| `AI_MODEL_ENABLED` | No | Enable Python agent AI review filter. | `false` |
| `AI_MODEL_PROVIDER` | No | AI provider name. | `gemini` |
| `AI_MODEL_API_KEY` | Required when Python AI enabled | Generic AI API key. | `...` |
| `GEMINI_API_KEY` | Required for Gemini provider | Gemini API key. | `...` |
| `AI_MODEL_NAME` | No | AI model name. | `gemini-1.5-flash` |
| `AI_MODEL_BASE_URL` | Required for compatible/custom providers | AI API base URL. | `https://api.example.com/v1` |
| `AI_MODEL_TIMEOUT` | No | AI request timeout in seconds. | `30` |
| `AI_MODEL_MIN_SCORE` | No | Minimum AI score for accepted action calls. | `0.6` |
| `MARKET_DATA_MODE` | No | `rest`, `websocket`, `evaluate`, or `dashboard`. | `websocket` |
| `REALTIME_PRINT_INTERVAL_SECONDS` | No | Realtime print interval. | `5` |
| `DASHBOARD_HOST` | No | Python dashboard bind host. | `0.0.0.0` |
| `DASHBOARD_PORT` | No | Python dashboard port. | `8000` |
| `DASHBOARD_AUTO_SCAN` | No | Run dashboard auto-scan. | `false` |
| `DASHBOARD_AUTO_SCAN_INTERVAL_SECONDS` | No | Dashboard auto-scan interval. | `900` |
| `DASHBOARD_AUTO_EVALUATE` | No | Run dashboard auto-evaluation. | `true` |
| `DASHBOARD_AUTO_EVALUATE_INTERVAL_SECONDS` | No | Dashboard auto-evaluation interval. | `300` |
| `ALERT_ONLY_SIGNALS` | No | Only send Telegram when signal is not HOLD. | `true` |
<!-- AUTO-GENERATED: env-from-examples:end -->
