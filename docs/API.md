# API Reference

Source of truth: route handlers under [`src/app/api/`](../src/app/api/).

All routes use the Node.js runtime and `force-dynamic` (no static caching of responses unless noted).

## Action Call and Screener

### `GET /api/action-call`

BFF for the internal Python Action Call service.

| Query | Behavior |
|-------|----------|
| `symbol=BTCUSDT` | Analyze one symbol; `multi_timeframe=false` disables multi-timeframe analysis |
| `limit=50` | Return the latest stored action calls when no symbol is supplied |

The route forwards requests to `PYTHON_AGENT_URL` and returns the Python response. Internal authentication, when configured, uses `PYTHON_AGENT_INTERNAL_TOKEN`; the token is never returned to clients.

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
    "results": []
  },
  "settings": {},
  "recentAlerts": [],
  "recentActionCalls": [],
  "recentJournalEntries": []
}
```

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

The internal FastAPI service exposes `/api/v1/health`, `/api/v1/analyze`, `/api/v1/scan`, `/api/v1/action-calls/latest`, `/api/v1/screener/latest`, and `/api/v1/screener/run`. Keep port `8000` bound to localhost; expose only the Next.js BFF through nginx.

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
- Cron auth is independent and uses `CRON_SECRET` only on `/api/cron/screener`.
