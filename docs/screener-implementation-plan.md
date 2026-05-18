# Screener Implementation Plan — Phase 1

> **Status**: Phase 1 complete — Foundation, Screener Worker & Ranking Engine.
> **Last verified**: 2026-05-18

---

## Step 1 — Repo Audit

### Reusable Modules Identified

| Module | Path | Reuse in Screener |
|--------|------|-------------------|
| Futures signal engine (V2, strict pipeline) | `src/lib/analysis/futures-signal-engine.ts` → `engine/pipeline.ts` | **Direct call** — source-of-truth for all LONG/SHORT/WAIT decisions |
| Data health gate | `src/lib/analysis/data-health-gate.ts` | Via engine pipeline |
| Regime detector / permission | `src/lib/analysis/regime-detector.ts`, `regime-permission.ts` | Via engine pipeline |
| MTF cascade + confirmation | `src/lib/analysis/mtf-cascade.ts`, `multi-timeframe-engine.ts` | Via engine pipeline |
| Entry trigger classifier | `src/lib/analysis/entry-trigger-classifier.ts` | Via engine pipeline |
| Risk engine | `src/lib/analysis/risk-engine.ts` | Via engine pipeline |
| Signal grade | `src/lib/analysis/signal-grade.ts` | Via engine pipeline |
| No-trade ranker | `src/lib/analysis/no-trade-rank.ts` | Via engine pipeline |
| Funding rate filter | `src/lib/analysis/funding-rate-filter.ts` | Via engine pipeline |
| Open interest filter | `src/lib/analysis/open-interest-filter.ts` | Via engine pipeline |
| Forecast agreement | `src/lib/analysis/forecast-agreement.ts` | Via engine pipeline |
| Late-entry guard | `src/lib/analysis/late-entry-guard.ts` | Via engine pipeline |
| Worker kline fetcher | `src/lib/worker/binance.ts` | **Direct reuse** — `fetchKlines()` |
| Worker config loader | `src/lib/worker/config.ts` | Pattern reference (screener has its own config) |
| Worker store | `src/lib/worker/store.ts` | Not reused yet — screener is stateless in Phase 1 |
| Worker runner | `src/lib/worker/runner.ts` | Pattern reference for cycle orchestration |
| Worker types | `src/lib/worker/types.ts` | Reference for `WorkerInterval`, `FuturesSignalAction` |
| Binance Futures REST client | `src/lib/binance/binance-futures-client.ts` | Available for future symbol discovery |
| Telegram sender | `src/lib/worker/telegram.ts` | Not used in Phase 1 |
| Alert dedupe | `src/lib/worker/dedupe.ts` | Not used in Phase 1 |

### Hardening Status (pre-screener)

| Feature | Status |
|---------|--------|
| Signal freshness UI (`dataHealth` in `FuturesSignal`) | ✅ Implemented |
| Source-of-truth worker path (`generateFuturesSignal`) | ✅ Single canonical re-export |
| Persistence layer (JSONL + state.json) | ✅ Atomic writes via `WorkerStore` |
| Phase 1 strict pipeline (confidence cap, trade permission, entry status, risk approval) | ✅ All additive fields present |
| Phase 5 forecast + late-entry guard | ✅ Integrated into pipeline |

### Baseline Checks

| Check | Result |
|-------|--------|
| `npm run typecheck` | ✅ Pass |
| `npm run lint` | ✅ Pass |
| `npm test` (135 tests, 12 files) | ✅ Pass |
| `npm run build` | ✅ Pass |

---

## Step 2 — Screener Domain

### Files Created

```
src/lib/screener/
  types.ts       — ScreenerConfig, ScreenerResult, RankedScreenerResult, etc.
  config.ts      — DEFAULT_SCREENER_CONFIG, grade helpers
  universe.ts    — Static top-10 USDⓈ-M futures universe (frozen)
  runner.ts      — Screener worker cycle (bounded concurrency, no AI)
  ranker.ts      — Deterministic risk-first ranking engine
  __tests__/
    ranker.test.ts — 16 deterministic ranker tests
```

### Universe (static top-10)

| Symbol | Base | Rank |
|--------|------|------|
| BTCUSDT | BTC | 1 |
| ETHUSDT | ETH | 2 |
| BNBUSDT | BNB | 3 |
| SOLUSDT | SOL | 4 |
| XRPUSDT | XRP | 5 |
| ADAUSDT | ADA | 6 |
| DOGEUSDT | DOGE | 7 |
| AVAXUSDT | AVAX | 8 |
| TRXUSDT | TRX | 9 |
| LINKUSDT | LINK | 10 |

### Default Config

| Setting | Value |
|---------|-------|
| Setup TF | 30m |
| Trigger TF | 15m |
| Macro TF | 4h |
| Interval | 15min |
| Max concurrent | 3 |
| Candle limit | 300 |

### Alert/Rank Settings (defaults)

| Setting | Value |
|---------|-------|
| enabled | false |
| minConfidence | 75 |
| minGrade | B |
| minRiskReward | 1.5 |
| maxAlertsPerHour | 3 |
| cooldownMinutes | 60 |
| sendWaitAlerts | false |
| topNOnly | 3 |

---

## Step 3 — Screener Worker

### Architecture

```
scripts/screener/start.ts  (CLI entrypoint)
  └─ runScreenerCycle()     (src/lib/screener/runner.ts)
       ├─ fetchKlines()     (reused from src/lib/worker/binance.ts)
       └─ generateFuturesSignal()  (canonical engine, unchanged)
```

### Design Decisions

1. **No duplicate trading logic** — screener calls the same `generateFuturesSignal()` as the worker and UI.
2. **One failure ≠ abort** — `Promise.allSettled` per batch; failures tracked in health.
3. **Bounded concurrency** — `maxConcurrentSymbols` (default 3) batches prevent rate-limit storms.
4. **No AI in hot path** — Phase 1 has zero AI calls. Engine is purely deterministic.
5. **No alert sending** — Phase 1 only prints results. Alert metadata is produced for ranking.
6. **Stale data → WAIT** — The engine's data-health gate already handles this; screener doesn't add logic.
7. **No fabrication** — entry/SL/TP passed through from engine. Null when engine returns null.

### CLI

```bash
npm run screener -- --once   # single shot, exits
npm run screener             # long-running loop
npm run screener -- --help   # usage
```

---

## Step 4 — Ranking Engine

### Score Model

```
rankingScore =
    confidence       × 0.35
  + gradeScore       × 0.20
  + riskRewardScore  × 0.20
  + mtfAlignment     × 0.15
  + freshnessScore   × 0.10
  - penalties
```

### Eligibility Filters

All must pass:
- action ∈ {LONG, SHORT}
- confidence ≥ minConfidence
- grade meets minGrade
- dataHealth.ok = true
- riskReward ≥ minRiskReward (when available)
- tradePermission does not conflict with action

### Penalties

| Condition | Penalty |
|-----------|---------|
| Stale data | -15 |
| Insufficient data | -20 |
| Extreme funding | -10 |
| OI conflict | -8 |
| Late entry | -12 |
| Overextension | -10 |
| Weak alignment | -5 |

### Stability Guarantee

Identical inputs → identical output order. Tie-breaking: confidence → marketCapRank.

---

## Verification (post-implementation)

| Check | Result |
|-------|--------|
| `npm run typecheck` | ✅ Pass |
| `npm run lint` | ✅ Pass |
| `npm test` (135 tests, 12 files) | ✅ All pass |
| `npm run build` | ✅ Pass |
| `npm run screener -- --once` | ✅ 10/10 symbols evaluated, 0 failures |
| Ranking determinism test | ✅ Verified (ranker.test.ts) |
| WAIT treated as valid analysis | ✅ (rank=0, not an error) |
| No duplicate signal engine | ✅ Single re-export |
| No AI decision flow | ✅ Zero AI calls in screener |

---

## Next Phases (not in scope)

- Phase 2: Persistence (screener JSONL log + state)
- Phase 3: Alert delivery (Telegram integration with cooldown/dedupe)
- Phase 4: UI dashboard (ranked table, filters, detail modal)
- Phase 5: Dynamic universe refresh (exchange info polling)
- Phase 6: AI commentary layer (post-decision, auditable, never overrides engine)
