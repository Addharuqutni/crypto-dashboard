# Crypto Dashboard Worker

A standalone, headless monitor for the crypto-dashboard signal engine. Runs
without a browser, evaluates Binance USDⓈ-M Futures candles, dedupes alerts,
and pushes disciplined Telegram notifications.

## Quick start

```bash
# 1. install deps (one-time)
npm install

# 2. configure
cp .env.worker.example .env.local
# edit .env.local and fill TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID

# 3. run a single evaluation
npm run worker -- --once

# 4. run continuously (Ctrl-C to stop)
npm run worker
```

The first run creates `./data/worker/`:

- `state.json` — atomically rewritten health + dedupe registry
- `signals.jsonl` — append-only log, one signal per line

Both files are gitignored.

## Telegram setup

1. **Create a bot.** Message [@BotFather](https://t.me/BotFather) and send
   `/newbot`. Copy the token shown after the bot is created.
2. **Find your chat id.** Send any message to your new bot, then visit
   `https://api.telegram.org/bot<TOKEN>/getUpdates`. The numeric `chat.id`
   under `result[0].message.chat` is what you need.
3. **Set both values** in `.env.local`:
   ```bash
   TELEGRAM_BOT_TOKEN=123456:abc...
   TELEGRAM_CHAT_ID=987654321
   ```
4. (Optional) **Use a channel.** Add the bot as an admin and use the
   channel's numeric id (negative integer) as `TELEGRAM_CHAT_ID`.

The worker never logs the bot token. It is only ever passed in the URL of
the outgoing API call.

## Alert format

```
Action: LONG | Confidence: 78 | Grade: A
Timeframe: BTCUSDT Futures — 30m, arah 4h

Setup:
- Regime bullish trend
- Permission: long only
- Trigger: pullback retest
- MTF alignment: 80/100

Risk:
- Entry: 64210.50
- SL: 63540.00
- TP: 65120.00 / 66000.00 / 67200.00
- Invalidation: price below SL
- Risk level: LOW

Reason:
- EMA20 > EMA50
- ADX 25.0 (+DI 28.4 / -DI 14.1)
- ATR 0.84% of price.
- Bias: LONG.

Next step:
- Long only on confirmation; place SL at 63540.00.
```

WAIT outcomes are silenced by default; flip `WORKER_SEND_WAIT_ALERTS=true`
to also forward them.

## Dedupe rules

| Rule | Effect |
|------|--------|
| Per-(symbol, action, setup) cooldown | Same alert won't repeat for `WORKER_ALERT_COOLDOWN_MIN` minutes |
| Material-change re-alerting | Re-emit allowed inside cooldown when grade improves, confidence jumps ≥10pt, or entry/SL move ≥0.5% |
| Confidence floor | Directional alerts < `WORKER_MIN_CONFIDENCE` are dropped |
| Health alerts rate-limited | At most `WORKER_HEALTH_ALERTS_PER_HOUR` of each kind per hour |

## Observable health

`state.json` always reflects the most recent run. Inspect it any time:

```jsonc
{
  "health": {
    "lastRunAt": 1700000000000,
    "lastSuccessAt": 1700000000000,
    "lastErrorAt": null,
    "consecutiveErrors": 0,
    "lastEvaluatedSymbol": "BTCUSDT",
    "lastSignalAction": "WAIT",
    "lastDeliveryStatus": "skipped",
    "lastError": null,
    "healthAlertsThisHour": {}
  },
  "dedupe": { "...": "..." }
}
```

`signals.jsonl` is append-only — one JSON object per line, grep-friendly:

```bash
grep '"action":"LONG"' data/worker/signals.jsonl | tail
```

## Failure behavior

| Failure | Behavior |
|---------|----------|
| Binance fetch fails for a symbol | No trade signal emitted; consecutiveErrors++; on ≥2 in a row, a rate-limited health alert is sent |
| Data stale (Phase 1 health gate) | Engine emits WAIT with reason; worker records it but never sends fake LONG/SHORT |
| Telegram 5xx / network error | Up to 4 attempts with backoff (200ms → 4s); marked `failed` if all fail |
| Telegram 4xx | Treated as terminal (token/chat misconfigured); marked `failed` immediately |
| Worker crash | State persists between runs — no duplicate alerts on restart |

## Deployment options

The worker is a single Node script with no native dependencies. Common ways
to run it 24/7:

| Target | Notes |
|--------|-------|
| **systemd** on a Linux VPS | Most reliable. Add `Restart=always` and a `User=` clause. |
| **Docker** | `node:20-alpine` base; mount `./data` as a volume. |
| **PM2** | `pm2 start "npm run worker" --name crypto-worker`. |
| **Vercel Cron / GitHub Actions** | Use `--once` per scheduled invocation. State directory must persist between runs (KV / S3). |
| **Cron** (simple) | `*/15 * * * * cd /opt/crypto && /usr/bin/node node_modules/tsx/dist/cli.mjs scripts/worker/start.ts --once` |

For Vercel-style serverless, swap the JSONL/state store for a hosted KV
(Postgres, Supabase, Vercel KV, etc). The `WorkerStore` interface is small
and only needs `init`, `readState`, `writeState`, `appendSignal`.
