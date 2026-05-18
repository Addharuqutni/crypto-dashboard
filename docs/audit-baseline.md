# Phase 0 — Repository Audit Baseline

**Repository:** `crypto-dashboard`
**Branch HEAD:** `e40b87f adjust`
**Audit date:** 2026-05-18
**Auditor:** Senior fullstack reviewer (read-only)
**Stack:** Next.js 16, React 19, TypeScript 6, Tailwind 4, Zustand 5, TanStack Query 5, Vitest 3
**Domain:** Binance USDⓈ-M Futures dashboard + signal engine + AI summary + journal + backtest + Telegram worker

> No source code was modified in this phase. Dependencies were already
> installed; no install was required to run the checks.

---

## 1. Toolchain Versions

| Tool | Version |
|---|---|
| Node | v24.13.1 |
| npm | 11.8.0 |
| Next.js | 16.2.6 (webpack pipeline used) |
| TypeScript | ^6.0.3 |
| Vitest | 3.2.4 |
| ESLint | 10.3.0 |

---

## 2. Health Check Results

| Check | Command | Status | Notes |
|---|---|---|---|
| Type check | `npm run typecheck` | PASS (exit 0) | `tsc --noEmit`, zero errors. |
| Lint | `npm run lint` | PASS (exit 0) | `eslint src/`, zero warnings/errors. |
| Tests | `npm test` | PASS | 11 test files, **119 tests passed**, ~2.5s. |
| Build | `npm run build` | PASS | `next build --webpack`, all 8 routes generated. |
| Security | `npm audit --omit=dev` | **2 moderate** | Transitive `postcss <8.5.10` via Next.js. |

### 2.1 Test files present

11 Vitest suites under `src/**/__tests__/`:

- [action-call-guard.test.ts](file:///d:/PROJECT/REACT/crypto/src/lib/ai/__tests__/action-call-guard.test.ts) (16 tests)
- [forecast-agreement.test.ts](file:///d:/PROJECT/REACT/crypto/src/lib/analysis/__tests__/forecast-agreement.test.ts) (11 tests)
- [futures-signal-engine.test.ts](file:///d:/PROJECT/REACT/crypto/src/lib/analysis/__tests__/futures-signal-engine.test.ts) (8 tests)
- [late-entry-guard.test.ts](file:///d:/PROJECT/REACT/crypto/src/lib/analysis/__tests__/late-entry-guard.test.ts) (10 tests)
- [binance-kline.test.ts](file:///d:/PROJECT/REACT/crypto/src/lib/api/__tests__/binance-kline.test.ts) (4 tests)
- [backtest.test.ts](file:///d:/PROJECT/REACT/crypto/src/lib/backtest/__tests__/backtest.test.ts) (10 tests)
- [equity-curve.test.ts](file:///d:/PROJECT/REACT/crypto/src/lib/backtest/__tests__/equity-curve.test.ts) (3 tests)
- [intelligence.test.ts](file:///d:/PROJECT/REACT/crypto/src/lib/intelligence/__tests__/intelligence.test.ts) (13 tests)
- [pnl.test.ts](file:///d:/PROJECT/REACT/crypto/src/lib/journal/__tests__/pnl.test.ts) (13 tests)
- [worker.test.ts](file:///d:/PROJECT/REACT/crypto/src/lib/worker/__tests__/worker.test.ts) (13 tests)
- [use-signal-journal-store.test.ts](file:///d:/PROJECT/REACT/crypto/src/stores/__tests__/use-signal-journal-store.test.ts) (18 tests)

### 2.2 Build output

```
Route (app)
┌ ○ /                     (static)
├ ○ /_not-found
├ ○ /alerts
├ ○ /backtest
├ ƒ /coin/[symbol]        (dynamic, server-rendered)
├ ○ /journal
├ ○ /portfolio
└ ○ /watchlist
```

Standalone output (`next.config.ts: output: 'standalone'`) is configured for cPanel-style Node hosting.

---

## 3. Dependency & Security Findings

### 3.1 `npm audit --omit=dev`

```
postcss  <8.5.10
Severity: moderate
PostCSS XSS via Unescaped </style> in CSS Stringify Output (GHSA-qx2v-qp2m-jg93)
node_modules/next/node_modules/postcss
  next  9.3.4-canary.0 - 16.3.0-canary.5
  Depends on vulnerable versions of postcss

2 moderate severity vulnerabilities
```

> [!NOTE]
> The vulnerable `postcss` is **nested inside `next/`**, not the
> top-level `postcss` (which is `^8.5.14`, already patched). The fix is gated by
> a Next.js patch release. `npm audit fix --force` would downgrade to
> `next@9.3.3` and is not acceptable.
> XSS surface here is limited to CSS produced by the build chain; runtime
> exposure for this app is low because user-controlled content is not piped
> through PostCSS stringification.

### 3.2 Suspicious version pins (worth re-checking)

| Package | Pinned | Concern |
|---|---|---|
| `lucide-react` | `^1.16.0` | Lucide React's stable line is `0.x`. A `1.x` major could be a republished package or namespace drift. |
| `@types/node` | `^25.8.0` | Way ahead of Node LTS (`^24` in use). Verify intentional. |
| `typescript` | `^6.0.3` | TypeScript `6.x` is unusual; track release notes for surprises. |

The build/typecheck pass on the resolved versions, so these are not blockers,
but they warrant a documented decision before tightening pins.

### 3.3 Secret hygiene

- `.env.local` exists locally (947 bytes) and is **not** tracked by git
  (`git ls-files .env.local` → not found).
- `.gitignore` covers `.env`, `.env*.local`, `*.pem`, `*.key`, `*.crt`, `data/`.
- `.env.worker.example` is committed and contains only placeholder keys, which
  is correct.
- `git status` shows two pre-existing changes unrelated to this audit:
  `M next-env.d.ts`, ` D prd.md` (see Section 5).

---

## 4. Largest Files (potential refactor candidates)

| Lines/Bytes | File | Notes |
|---|---|---|
| 39 KB / 1244 ln | [futures-signal-engine.ts](file:///d:/PROJECT/REACT/crypto/src/lib/analysis/futures-signal-engine.ts) | Core risk-first decision engine. Complex but justified. **High risk to change.** |
| 34 KB | [signal-journal-panel.tsx](file:///d:/PROJECT/REACT/crypto/src/components/technical-analysis/signal-journal-panel.tsx) | UI mega-component. |
| 29 KB | [futures-signal-panel.tsx](file:///d:/PROJECT/REACT/crypto/src/components/technical-analysis/futures-signal-panel.tsx) | UI mega-component. |
| 25 KB | [historical-backtest-panel.tsx](file:///d:/PROJECT/REACT/crypto/src/components/backtest/historical-backtest-panel.tsx) | Backtest UI. |
| 25 KB | [coin/\[symbol\]/page.tsx](file:///d:/PROJECT/REACT/crypto/src/app/coin/[symbol]/page.tsx) | Page composes most analysis features. |
| 21 KB | [candlestick-chart.tsx](file:///d:/PROJECT/REACT/crypto/src/components/chart/candlestick-chart.tsx) | TradingView wrapper. |
| 19 KB | [ai-technical-summary.tsx](file:///d:/PROJECT/REACT/crypto/src/components/ai-agent/ai-technical-summary.tsx) | AI streaming summary. |
| 19 KB | [market-table.tsx](file:///d:/PROJECT/REACT/crypto/src/components/market/market-table.tsx) | Realtime sortable grid. |
| 18 KB | [use-signal-journal-store.ts](file:///d:/PROJECT/REACT/crypto/src/stores/use-signal-journal-store.ts) | Zustand store. Already covered by 18 tests. |
| 17 KB | [use-binance-websocket.ts](file:///d:/PROJECT/REACT/crypto/src/lib/websocket/use-binance-websocket.ts) | Reconnect/throttle logic. |
| 13 KB | [use-binance-kline-websocket.ts](file:///d:/PROJECT/REACT/crypto/src/lib/websocket/use-binance-kline-websocket.ts) | Kline live updates. |

> [!NOTE]
> Per guardrails, do not refactor these in this phase. Note them as candidates
> for future targeted decomposition once a phase explicitly asks.

---

## 5. Highest-Risk Modules

| Module | Why it is risk-sensitive |
|---|---|
| [futures-signal-engine.ts](file:///d:/PROJECT/REACT/crypto/src/lib/analysis/futures-signal-engine.ts) | Owns trading thresholds, score gates, hard guards (overextension, MTF conflict, regime gate, late-entry guard, forecast agreement). Any change here can move WAIT/LONG/SHORT boundaries. |
| [risk-engine.ts](file:///d:/PROJECT/REACT/crypto/src/lib/analysis/risk-engine.ts) | Authoritative WAIT and stop/TP/RR floor. |
| [data-health-gate.ts](file:///d:/PROJECT/REACT/crypto/src/lib/analysis/data-health-gate.ts) | Strictest gate; if weakened, fake LONG/SHORT could leak through stale data. |
| [worker/dedupe.ts](file:///d:/PROJECT/REACT/crypto/src/lib/worker/dedupe.ts), [worker/runner.ts](file:///d:/PROJECT/REACT/crypto/src/lib/worker/runner.ts), [worker/telegram.ts](file:///d:/PROJECT/REACT/crypto/src/lib/worker/telegram.ts) | Outbound Telegram side-effects, alert cooldown, confidence floor, retry policy. |
| [ai/ai-prompt-builder.ts](file:///d:/PROJECT/REACT/crypto/src/lib/ai/ai-prompt-builder.ts), [ai/action-call-guard.ts](file:///d:/PROJECT/REACT/crypto/src/lib/ai/action-call-guard.ts), [intelligence/ai-auditor.ts](file:///d:/PROJECT/REACT/crypto/src/lib/intelligence/ai-auditor.ts) | Fabrication-prevention surface. AI commentary must remain grounded. |
| [websocket/use-binance-websocket.ts](file:///d:/PROJECT/REACT/crypto/src/lib/websocket/use-binance-websocket.ts) | Reconnect storms, duplicate subscriptions. |

---

## 6. Doc ↔ Implementation Mismatches

### 6.1 README claims tests are deleted (FALSE)

[README.md:72](file:///d:/PROJECT/REACT/crypto/README.md#L72) states:

> Vitest 3 — tersedia di script, test files saat ini sudah dihapus.

Reality: **11 test files, 119 passing tests.** README is stale.

### 6.2 task-breakdown.md references missing sibling docs

[task-breakdown.md:8](file:///d:/PROJECT/REACT/crypto/task-breakdown.md#L8) lists:

> Related Documents: `prd.md`, `architecture.md`, `ui-spec.md`

- `prd.md` — **deleted** (pending git change: ` D prd.md`)
- `architecture.md` — **does not exist** in repo
- `ui-spec.md` — **does not exist** in repo

Source files still cite these in comments
([trend-label.ts:12](file:///d:/PROJECT/REACT/crypto/src/lib/indicators/trend-label.ts#L12),
[market-overview-cards.tsx:31](file:///d:/PROJECT/REACT/crypto/src/components/market/market-overview-cards.tsx#L31),
[app-header.tsx:21](file:///d:/PROJECT/REACT/crypto/src/components/layout/app-header.tsx#L21),
[use-theme-store.ts:19](file:///d:/PROJECT/REACT/crypto/src/stores/use-theme-store.ts#L19)).

### 6.3 task-breakdown shipping status drift

The breakdown's milestones M-00..M-09 describe an MVP scope (price chart,
watchlist, alerts, fear & greed, basic indicators). Implementation has already
moved well past that into:

- Risk-first **futures signal engine** with regime/MTF/permission gates.
- **Backtest** runner + simulator + metrics.
- **AI auditor**, prompt builder, action-call guard.
- **Intelligence** layer (market context, no-trade, setup ranking, risk profile).
- **Telegram worker** with dedupe + health alerts.
- **Paper trading** store, **portfolio** store, **risk-profile** store.

The breakdown does not document any of this. It should be archived or
rewritten to match the current product, or both.

### 6.4 README "Tooling" section is incomplete

README does not mention:

- `npm run worker` / `tsx scripts/worker/start.ts`
- `npm test` (and tests, given 6.1)
- Backtest, AI auditor, intelligence layer, paper trading, risk profile.

---

## 7. Other Observations

- **TypeScript strictness** is high: `strict: true`, `noUncheckedIndexedAccess`,
  `noUnusedLocals`, `noUnusedParameters`. Good.
- **ESLint flat config** disables two `react-hooks` rules (`set-state-in-effect`,
  `refs`) with a comment explaining why. Acceptable; the disabled rules are
  noted in [eslint.config.mjs:33-36](file:///d:/PROJECT/REACT/crypto/eslint.config.mjs#L33-L36).
- **Vitest** uses `pool: 'forks'` and inlines worker modules — Windows-specific
  workaround documented inline. Good.
- **Coverage scope** in [vitest.config.ts:36](file:///d:/PROJECT/REACT/crypto/vitest.config.ts#L36)
  is restricted to `src/lib/chart/**/*.ts`, which is narrower than current
  test footprint. Worth widening to `src/lib/**/*.ts` and `src/stores/**/*.ts`
  later (not in this phase).
- **Worker docs** ([scripts/worker/README.md](file:///d:/PROJECT/REACT/crypto/scripts/worker/README.md))
  are thorough: setup, fallback when Telegram is misconfigured (`disabled`
  status), retry policy, deploy options.

---

## 8. Prioritized Issue List

### P0 — Blockers (none)

No blocking issues. Build, typecheck, lint, and 119 tests all pass.

### P1 — High priority (correctness or trust impact)

| ID | Issue | Suggested action | Notes |
|---|---|---|---|
| P1-1 | `README.md` tooling section claims tests are deleted, but 119 tests exist. | Update Tooling section to reflect Vitest is wired and used. | Pure doc fix. |
| P1-2 | `task-breakdown.md` references `prd.md`, `architecture.md`, `ui-spec.md`; only `prd.md` previously existed (now deleted), the other two never existed. | Either restore the docs or update the breakdown to drop dead references. | Source comments still cite the missing docs. |
| P1-3 | Pending git change ` D prd.md` is unrelated to current work. | Decide: restore PRD, replace with new PRD, or commit the deletion intentionally. | Don't lose product spec. |
| P1-4 | `task-breakdown.md` describes an MVP scope that the codebase has already surpassed (signal engine, backtest, AI auditor, worker, intelligence, paper trading). | Replace with an updated task breakdown that matches current modules and roadmap. | Avoid building from a stale plan. |
| P1-5 | README missing scripts/features: `npm run worker`, `npm test`, backtest page, intelligence layer, AI auditor, paper trading. | Append to README. | Reduces onboarding friction. |

### P2 — Medium priority (maintainability, hygiene)

| ID | Issue | Suggested action |
|---|---|---|
| P2-1 | `npm audit` → 2 moderate from nested `postcss` inside `next/`. | Track upstream Next.js patch; do not force-downgrade. Document in `audit-baseline`. |
| P2-2 | `lucide-react@^1.16.0` looks anomalous vs. upstream `0.x` line. | Verify package identity and intended major. |
| P2-3 | Several files exceed 25 KB / 600+ lines and mix logic with rendering (e.g. `signal-journal-panel.tsx`, `futures-signal-panel.tsx`, `coin/[symbol]/page.tsx`). | Plan targeted decomposition phases when allowed; do not preemptively refactor. |
| P2-4 | Coverage scope in `vitest.config.ts` is restricted to `src/lib/chart/**`. | Widen later to `src/lib/**`, `src/stores/**`. |
| P2-5 | `next-env.d.ts` shows as modified in `git status`. | Regenerated by Next; either commit current form or restore. Trivial. |

### P3 — Nice to have

| ID | Issue | Suggested action |
|---|---|---|
| P3-1 | No CI workflow file (`.github/workflows/*`) in repo. T-0906 in breakdown is open. | Add a CI workflow once doc/spec stabilizes. |
| P3-2 | `prettier` config (`.prettierrc`) exists but no `format` / `format:check` script. | Add scripts so formatting drift is checkable. |
| P3-3 | No `.editorconfig`. | Add for cross-platform consistency. |

---

## 9. Recommended Next Phases (per audit)

1. **Doc realignment** — fix P1-1..P1-5 first (no code risk, removes drift).
2. **Lock dependency story** — verify `lucide-react`, `@types/node`,
   `typescript` versions; document `npm audit` decision.
3. **Targeted refactor backlog** — capture P2-3 mega-files, but only act when a
   phase explicitly asks.
4. **CI + format scripts** — P3-1, P3-2.

> [!IMPORTANT]
> All trading thresholds, risk gates, and confidence caps in
> `futures-signal-engine.ts` and friends remain **unchanged** by this phase
> and must not be altered until a phase explicitly requests it.

---

## 10. Verification Trail

| Step | Command | Outcome |
|---|---|---|
| Confirm deps installed | `Test-Path node_modules` | exists |
| Confirm Node/npm | `node --version; npm --version` | v24.13.1 / 11.8.0 |
| Type check | `npm run typecheck` | exit 0 |
| Lint | `npm run lint` | exit 0 |
| Unit tests | `npm test` | 11 files / 119 tests passed |
| Production build | `npm run build` | exit 0, 8 routes |
| Audit (prod) | `npm audit --omit=dev` | 2 moderate |
| Git status | `git status --short` | ` M next-env.d.ts`, ` D prd.md` |
| Secret scan | `grep TELEGRAM_BOT_TOKEN .env.local` | no value (no leak in audit output) |

No source code was changed during this phase.
