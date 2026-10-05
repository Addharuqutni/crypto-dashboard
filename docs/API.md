# API Reference

Source of truth: route handlers under [`src/app/api/`](../src/app/api/).

All routes use the Node.js runtime. Every route except `/api/action-call` also
declares `force-dynamic`; `/api/action-call` reads request headers and query
params directly, which already opts it out of static rendering.

Every route sets `Cache-Control: no-store` on both success and error responses.
This matters because a success status is heuristically cacheable, so without it a
proxy or CDN could serve a stale snapshot with no way for the UI to tell. The
error path gets it from `apiErrorResponse`; see
[`src/lib/shared/http/error-response.ts`](../src/lib/shared/http/error-response.ts).

## Action Call and Screener

### `GET /api/action-call`

BFF for the internal Python Action Call service.

| Query | Behavior |
|-------|----------|
| `symbol=BTCUSDT` | Analyze one symbol; `multi_timeframe=false` disables multi-timeframe analysis |
| `limit=50` | Return the latest stored action calls when no symbol is supplied |

The route forwards requests to `PYTHON_AGENT_URL` and returns the Python response. Internal authentication, when configured, uses `PYTHON_AGENT_INTERNAL_TOKEN`; the token is never returned to clients.

**Entry mechanics.** `signal.entryOrderType` is `POST_ONLY_LIMIT` on every actionable call, and `signal.entryZone.min` is the limit price. The entry is not a market order: it is a resting post-only limit, cancelled if unfilled after 6 bars. This is the mechanism the fee assumption depends on — a market entry pays the taker rate and the setup is then net-negative by a wider margin. It does not make the strategy profitable; see the measurement in `agent/src/analyzer.py`. Rows stored before the field existed carry `null`.

### `POST /api/action-call`

Triggers a scan of the Python agent's configured universe. The request body is accepted for forward compatibility; the current Python endpoint determines the universe from configuration.

### `GET /api/screener`

Serves the latest Python screener snapshot to the UI. With `SCREENER_STORAGE_MODE=on-demand`, it requests a fresh Python run; otherwise it reads the latest snapshot from the Python service. If file mode has no snapshot, fallback to on-demand is controlled by `SCREENER_FILE_MODE_STRICT`.

**Auth / limits:** optional per-IP rate limit via `SCREENER_API_RATE_LIMIT_PER_MINUTE`.

**Success shape (simplified):**

```json
{
  "ok": true,
  "mode": "python",
  "latest": {
    "completedAt": 1710000000000,
    "health": {},
    "results": [],
    "alertDecisions": [
      {
        "symbol": "BTC/USDT",
        "action": "LONG",
        "status": "triggered",
        "reason": "policy_pass",
        "confidence": 82,
        "grade": "A",
        "rankingScore": 71.5,
        "entry": 65000,
        "stopLoss": 64000,
        "createdAt": 1710000000000
      }
    ]
  },
  "settings": {},
  "recentAlerts": [],
  "recentActionCalls": [],
  "recentJournalEntries": []
}
```

`recentAlerts` is the mapped `latest.alertDecisions` array, not a separate
store. The Python engine owns alert policy and stamps a decision for every
evaluated symbol each cycle; the dashboard maps the ones it can render and
drops the rest. Rows whose `status` or `action` is not a known value, or that
lack `confidence`/`createdAt`, are omitted rather than shown with placeholders.

`recentActionCalls` is always `[]` in this deployment, and is kept as an empty
array rather than removed so the response shape stays stable for existing
clients. The Python engine owns action calls: it persists its own rows to
`action-calls.json` and they reach the UI through `recentAlerts`. The richer
`ScreenerActionCallRecord` shape has no producer anywhere.

**Error shape:**

| Status | Meaning |
|--------|---------|
| `429` | Rate limited (`SCREENER_API_RATE_LIMIT_PER_MINUTE`) |
| `409` | A screener run is already in progress; retry shortly |
| `503` | Python agent unreachable |
| `504` | Python agent timed out |
| `502` | Upstream answered with an unexpected failure |

### `GET /api/cron/screener`

Bearer-protected scheduler entrypoint. It triggers `POST /api/v1/scan` on the Python service; it does not run the removed TypeScript screener cycle.

| Header | Required | Value |
|--------|----------|-------|
| `Authorization` | Yes | `Bearer <CRON_SECRET>` |

| Status | Meaning |
|--------|---------|
| `200` | Python scan completed |
| `401` | Missing/invalid bearer token |
| `409` | Python scan already running |
| `500` | `CRON_SECRET` unset |
| `502` | Python service failure |

Use an external scheduler such as Vercel Cron or system cron when a dedicated Python worker is not running.

### Python service endpoints

The internal FastAPI service exposes these routes. All require the
`X-Internal-Token` header matching `PYTHON_AGENT_INTERNAL_TOKEN` **except**
`/api/v1/health`, which is deliberately unauthenticated so a process manager or
load balancer can probe it.

| Method | Path | Auth | Purpose |
|--------|------|:----:|---------|
| `GET` | `/api/v1/health` | — | Liveness probe |
| `GET` | `/api/v1/analyze` | Yes | Analyze one symbol (multi-timeframe) |
| `GET` | `/api/v1/action-calls/latest` | Yes | Recent stored action calls (`limit`, max 1000) |
| `GET` | `/api/v1/screener/latest` | Yes | Latest persisted screener snapshot |
| `POST` | `/api/v1/scan` | Yes | Trigger an action-call scan |
| `POST` | `/api/v1/screener/run` | Yes | Run a screener cycle now |

It also serves an operator dashboard (`/`, `/dashboard`, `/api/scan`,
`/api/stats`, `/api/jobs`, `/api/evaluate`, `/api/action-calls`,
`/api/export/training.jsonl`, `/api/export/training.csv`). Those are for local
inspection and are **not** routed through the Next.js BFF; all except `/` and
`/dashboard` require the internal token.

Keep port `8000` bound to localhost; expose only the Next.js BFF through nginx.

## AI

### `POST /api/ai/chat`

Same-origin chat completion proxy (non-streaming). Rate-limited per client IP.

**Body:**

```json
{
  "config": { "baseUrl": "...", "apiKey": "...", "model": "..." },
  "messages": [{ "role": "user", "content": "..." }],
  "temperature": 0.7,
  "maxTokens": 2048
}
```

- If `config` is incomplete, falls back to server env (`AI_BASE_URL`, `AI_API_KEY`, `AI_MODEL`).
- Roles allowed: `system` | `user` | `assistant`.

| Status | Meaning |
|--------|---------|
| `200` | `{ "content": "..." }` |
| `400` | Missing messages or AI not configured |
| `429` | Rate limited |
| `500` | Upstream / internal failure |

### `GET /api/ai/config`

Reports whether server-side AI env is configured (does **not** return the API key).

```json
{ "configured": true, "baseUrl": "https://...", "model": "gpt-4o-mini" }
```

or

```json
{ "configured": false }
```

### `POST /api/ai/test`

Server-side connection test for OpenAI-compatible providers (avoids browser CORS issues).

**Body:** `{ "baseUrl", "apiKey", "model" }`

**Response:** `{ "success": boolean, "message": string }` with `200` / `400` / `500`.

## Agent

### `GET /api/agent`

Read-only AI Signal Agent over the latest screener snapshot. Never places orders and never recomputes client-side signals.

| Query | Default | Range | Description |
|-------|---------|-------|-------------|
| `topN` | `5` | `1`–`10` | Number of top setups to summarize |

| Status | Meaning |
|--------|---------|
| `200` | `{ ok: true, source, result }` |
| `404` | No screener snapshot — run screener first |
| `500` | Agent failure |

If AI env is missing, the agent still returns deterministic decisions without LLM enrichment.

## Auth Notes

- Optional site-wide Basic Auth is enforced in [`src/proxy.ts`](../src/proxy.ts) when `BASIC_AUTH_ENABLED=1`. API routes are included in the matcher.
- Cron auth uses `CRON_SECRET` on `/api/cron/screener` and `POST /api/action-call` (scan trigger).
- AI chat/test: SSRF-blocked private hosts; partial client config never falls back to server `AI_*` keys.
- Rate limits on `/api/ai/*`, `/api/agent`, `/api/action-call`, `/api/screener`. Set `TRUST_PROXY=1` behind nginx.
