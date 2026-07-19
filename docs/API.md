# API Reference

Source of truth: route handlers under [`src/app/api/`](../src/app/api/).

All routes use the Node.js runtime and `force-dynamic` (no static caching of responses unless noted).

## Screener

### `GET /api/screener`

Serves screener data to the UI.

| Mode | When | Behavior |
|------|------|----------|
| `file` | `SCREENER_STORAGE_MODE=file` (production default) | Reads persisted snapshot from storage backend |
| `on-demand` | `SCREENER_STORAGE_MODE=on-demand` or dev default | Runs a full screener cycle in-request |

**Auth / limits:** optional per-IP rate limit via `SCREENER_API_RATE_LIMIT_PER_MINUTE`.

**Success shape (simplified):**

```json
{
  "ok": true,
  "mode": "file",
  "latest": {
    "completedAt": 1710000000000,
    "health": {},
    "results": [],
    "timeframes": { "setup": "30m", "trigger": "15m", "macro": "4h" },
    "universeSize": 100
  },
  "settings": {},
  "recentAlerts": [],
  "recentActionCalls": [],
  "recentJournalEntries": []
}
```

### `GET /api/cron/screener`

Vercel Cron / external scheduler entrypoint. Runs one cycle in-process and persists the result.

| Header | Required | Value |
|--------|----------|-------|
| `Authorization` | Yes | `Bearer <CRON_SECRET>` |

| Status | Meaning |
|--------|---------|
| `200` | Cycle completed |
| `401` | Missing/invalid bearer token |
| `500` | `CRON_SECRET` unset, or cycle failure |

`maxDuration = 60` (serverless time budget).

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
