# Development Task Breakdown
# Crypto Market Dashboard

**Version:** 1.1  
**Status:** Refined Development Ready Draft  
**Owner:** Haru  
**Prepared by:** Nero  
**Related Documents:** `prd.md`, `architecture.md`, `ui-spec.md`  
**Last Updated:** 2026-05-15

---

## 1. Purpose

Dokumen ini memecah kebutuhan produk dan arsitektur menjadi daftar task pengembangan yang dapat dieksekusi secara bertahap. Task disusun berdasarkan milestone agar development lebih terarah, mudah diprioritaskan, dan dapat diuji per fase.

Dokumen ini dapat digunakan sebagai dasar GitHub Issues, Linear/Jira tickets, atau checklist sprint.

---

## 2. Delivery Strategy

### 2.1 Recommended Delivery Model

Gunakan pendekatan **incremental milestone delivery**:

1. Foundation.
2. Core market data.
3. Dashboard MVP.
4. Watchlist and coin detail.
5. Portfolio and alerts.
6. Technical analysis.
7. Hardening and release.

Setiap milestone harus menghasilkan aplikasi yang tetap bisa dijalankan dan diuji.

### 2.2 Definition of Ready

Task siap dikerjakan jika:

- Scope jelas.
- Acceptance criteria tersedia.
- Dependency diketahui.
- Data source jelas.
- UI state minimal diketahui: loading, success, empty, error.

### 2.3 Definition of Done

Task dianggap selesai jika:

- Implementasi sesuai acceptance criteria.
- TypeScript compile tanpa error.
- Lint tidak menghasilkan error kritikal.
- UI memiliki loading/error/empty state jika relevant.
- Basic responsive behavior dicek.
- Logic penting memiliki unit test.
- Tidak ada console error yang jelas di browser.

---

## 3. Milestone Overview

| Milestone | Name | Goal | Priority |
|---|---|---|---|
| M-00 | Project Foundation | Setup project, tooling, conventions | Must Have | MVP Core |
| M-01 | Data Layer | REST API, WebSocket, types, formatting | Must Have | MVP Core |
| M-02 | Dashboard MVP | Home dashboard, live price, market overview | Must Have | MVP Core |
| M-03 | Search and Watchlist | Search coin and local watchlist | Must Have | MVP Core |
| M-04 | Coin Detail and Chart | Detail page, chart, timeframe | Must Have | MVP Core |
| M-05 | Portfolio Tracker | Local portfolio and calculations | Should Have | MVP Plus |
| M-06 | Price Alerts | Local browser notification alerts | Should Have | MVP Plus |
| M-07 | Fear & Greed | Market sentiment widget | Should Have | MVP Plus |
| M-08 | Technical Analysis | MA, RSI, MACD, support/resistance | Should Have | V1.1 |
| M-09 | Quality and Release | Testing, accessibility, performance, deployment | Must Have | Cross-phase |


---

## 3.1 Estimation and Risk Scale

### Estimate

| Size | Meaning |
|---|---|
| XS | < 0.5 day |
| S | 0.5–1 day |
| M | 1–2 days |
| L | 2–4 days |
| XL | Needs breakdown before implementation |

### Risk

| Risk | Meaning |
|---|---|
| Low | Straightforward implementation with known approach |
| Medium | Requires integration, state coordination, or careful UX handling |
| High | Uncertain provider behavior, performance risk, or core architectural impact |

High-risk tasks should have spike/prototype work before full implementation.

---

## 4. Task Breakdown


## M-00A — Technical Spikes

### T-00S1 — Spike Binance Combined WebSocket Stream

**Priority:** Must Have  
**Type:** Spike  
**Estimate:** S  
**Risk:** High  
**Dependencies:** None

**Goal:**  
Validate combined stream format, reconnect behavior, and subscription limits before building production WebSocket client.

**Acceptance Criteria:**

- Can receive live updates for at least 20 symbols.
- Connection can recover after manual disconnect.
- Payload normalization requirements are documented.

---

### T-00S2 — Spike CoinGecko and Binance Symbol Mapping

**Priority:** Must Have  
**Type:** Spike  
**Estimate:** M  
**Risk:** High  
**Dependencies:** None

**Goal:**  
Validate mapping between UI symbol, CoinGecko id, and Binance trading pair.

**Acceptance Criteria:**

- BTC, ETH, BNB, SOL, XRP mappings are verified.
- Initial 20 coin registry candidates are documented.
- Known mismatch risks are listed.

---

### T-00S3 — Spike TradingView Lightweight Charts with MA Overlay

**Priority:** Should Have  
**Type:** Spike  
**Estimate:** M  
**Risk:** Medium  
**Dependencies:** None

**Goal:**  
Validate chart rendering, timeframe switching, and overlay support.

**Acceptance Criteria:**

- Line chart renders candle close prices.
- MA overlay can be rendered.
- Mobile resize behavior is acceptable.

---

### T-00S4 — Spike Browser Notification Reliability

**Priority:** Should Have  
**Type:** Spike  
**Estimate:** S  
**Risk:** Medium  
**Dependencies:** None

**Goal:**  
Validate browser notification permission flow and limitations.

**Acceptance Criteria:**

- Granted, denied, and default states are documented.
- Browser-active limitation is confirmed and reflected in UI copy.

---

## M-00 — Project Foundation

### T-0001 — Initialize Next.js Project

**Priority:** Must Have  
**Type:** Setup  
**Dependencies:** None

**Description:**  
Create the base application using Next.js and TypeScript.

**Tasks:**

- Initialize Next.js app.
- Enable TypeScript.
- Configure App Router.
- Configure project alias, e.g. `@/`.
- Confirm app runs locally.

**Acceptance Criteria:**

- App runs with local dev command.
- TypeScript is enabled.
- Initial route renders successfully.

---

### T-0002 — Configure Styling System

**Priority:** Must Have  
**Type:** Setup  
**Dependencies:** T-0001

**Tasks:**

- Install Tailwind CSS.
- Configure Tailwind theme tokens.
- Install and configure shadcn/ui.
- Add base global styles.
- Configure dark mode default.

**Acceptance Criteria:**

- Tailwind classes work.
- shadcn/ui component can render.
- App starts in dark mode by default.

---

### T-0003 — Configure Code Quality Tooling

**Priority:** Must Have  
**Type:** Setup  
**Dependencies:** T-0001

**Tasks:**

- Configure ESLint.
- Configure Prettier.
- Enable TypeScript strict mode.
- Add scripts: `lint`, `typecheck`, `test`, `build`.

**Acceptance Criteria:**

- `lint` runs successfully.
- `typecheck` runs successfully.
- `build` runs successfully.

---

### T-0004 — Create Base Folder Structure

**Priority:** Must Have  
**Type:** Architecture  
**Dependencies:** T-0001

**Tasks:**

- Create `components/`, `lib/`, `stores/`, and `types/` directories.
- Add placeholder module files for market, portfolio, alert, and technical analysis.
- Add README notes for internal folder conventions if needed.

**Acceptance Criteria:**

- Folder structure matches `architecture.md` baseline.
- Imports work using project alias.

---

## M-01 — Data Layer

### T-0100 — Create Coin Registry

**Priority:** Must Have  
**Type:** Data Model  
**Estimate:** M  
**Risk:** High  
**Dependencies:** T-00S2

**Tasks:**

- Define `CoinRegistryItem` type.
- Create verified default registry for 20 coins.
- Include `symbol`, `name`, `coingeckoId`, `binanceSymbol`, `quoteAsset`, `isDefault`, and `isActive`.
- Add lookup helpers by symbol, Binance symbol, and CoinGecko id.

**Acceptance Criteria:**

- BTC maps correctly across UI, Binance, and CoinGecko.
- Search can use registry without external request per keypress.
- Invalid or unmapped coin is handled safely.

---

### T-0101 — Define Core TypeScript Types

**Priority:** Must Have  
**Type:** Data Model  
**Dependencies:** T-0100

**Tasks:**

- Define `CoinSymbol`, `LivePrice`, `CoinMetadata`, `Candle`.
- Define `WatchlistItem`, `PortfolioHolding`, `PriceAlert`.
- Define technical analysis result types.

**Acceptance Criteria:**

- Types are exported from `types/`.
- No broad `any` usage for core domain models.

---

### T-0102 — Build Formatting Utilities

**Priority:** Must Have  
**Type:** Utility  
**Dependencies:** T-0101

**Tasks:**

- Implement currency formatter.
- Implement percentage formatter.
- Implement compact number formatter.
- Implement date/time formatter.

**Acceptance Criteria:**

- `$67,245.20`, `+2.45%`, and `$1.2B` style values render correctly.
- Unit tests cover normal, zero, negative, and missing values.

---

### T-0103 — Build Safe LocalStorage Utility

**Priority:** Must Have  
**Type:** Utility  
**Dependencies:** T-0101

**Tasks:**

- Implement safe JSON parse.
- Implement read/write/remove helpers.
- Handle corrupted data gracefully.
- Define storage keys.

**Acceptance Criteria:**

- Invalid JSON does not crash app.
- Utility returns fallback values safely.
- Unit tests cover corrupted storage input.

---

### T-0104 — Implement CoinGecko API Client

**Priority:** Must Have  
**Type:** Integration  
**Dependencies:** T-0101

**Tasks:**

- Add API client wrapper for metadata and market data.
- Normalize response into internal types.
- Handle request failure.

**Acceptance Criteria:**

- Client returns normalized market metadata.
- Errors are handled without throwing uncaught runtime errors in UI.

---

### T-0105 — Implement Binance Kline API Client

**Priority:** Must Have  
**Type:** Integration  
**Dependencies:** T-0101

**Tasks:**

- Add client for historical candles.
- Support timeframe mapping for 1H, 24H, 7D, 30D.
- Normalize candle data.

**Acceptance Criteria:**

- Client returns candle array for valid symbol/timeframe.
- Invalid symbol/timeframe returns controlled error.

---

### T-0106 — Implement Binance WebSocket Client

**Priority:** Must Have  
**Type:** Integration  
**Dependencies:** T-0101

**Tasks:**

- Connect to Binance public WebSocket stream.
- Subscribe to default symbols.
- Normalize incoming price events.
- Implement connection status.
- Implement reconnect strategy.
- Prevent duplicate subscriptions.

**Acceptance Criteria:**

- Live price updates appear in store.
- Disconnect triggers reconnect.
- UI can read connection status.

---

## M-02 — Dashboard MVP

### T-0201 — Build App Shell

**Priority:** Must Have  
**Type:** UI  
**Dependencies:** T-0002

**Tasks:**

- Create layout shell.
- Add top header.
- Add navigation links.
- Add responsive container.
- Add theme toggle placeholder.

**Acceptance Criteria:**

- All main pages share consistent layout.
- Layout works on desktop and mobile.

---

### T-0202 — Build Market Store

**Priority:** Must Have  
**Type:** State  
**Dependencies:** T-0106

**Tasks:**

- Create Zustand store for live prices.
- Add update action for WebSocket events.
- Add selectors for price by symbol and all prices.

**Acceptance Criteria:**

- Store updates on live price events.
- Components can subscribe to individual symbol prices.

---

### T-0203 — Build Market Overview Cards

**Priority:** Must Have  
**Type:** UI  
**Dependencies:** T-0104, T-0202

**Tasks:**

- Build market summary cards.
- Show market cap, volume, price change, and tracked assets.
- Add loading and error states.

**Acceptance Criteria:**

- Cards render real or mocked data.
- Loading and error states are visible when needed.

---

### T-0204 — Build Top Coins Table

**Priority:** Must Have  
**Type:** UI  
**Dependencies:** T-0104, T-0202

**Tasks:**

- Render top coins table.
- Columns: coin, price, 24h change, volume, market cap.
- Add sorting for price, change, volume, market cap.
- Add link to coin detail.

**Acceptance Criteria:**

- Table renders at least 20 assets.
- Sorting works correctly.
- Price updates do not break layout.

---

### T-0205 — Build Connection Status Indicator

**Priority:** Must Have  
**Type:** UI  
**Dependencies:** T-0106

**Tasks:**

- Display connected, reconnecting, disconnected.
- Place indicator in header or dashboard area.

**Acceptance Criteria:**

- Status changes based on WebSocket lifecycle.
- User can understand whether prices are live or stale.

---

## M-03 — Search and Watchlist

### T-0301 — Build Coin Search Component

**Priority:** Must Have  
**Type:** UI  
**Dependencies:** T-0104

**Tasks:**

- Build search input.
- Search by symbol and name.
- Show dropdown results.
- Add empty state.
- Navigate to coin detail on selection.

**Acceptance Criteria:**

- Search results appear within target performance.
- Invalid query shows empty state.
- Selecting result navigates correctly.

---

### T-0302 — Build Watchlist Store

**Priority:** Must Have  
**Type:** State  
**Dependencies:** T-0103

**Tasks:**

- Create Zustand watchlist store.
- Persist to localStorage.
- Add actions: add, remove, check exists.
- Prevent duplicate items.

**Acceptance Criteria:**

- Watchlist persists after refresh.
- Duplicate coin cannot be added twice.

---

### T-0303 — Build Watchlist UI

**Priority:** Must Have  
**Type:** UI  
**Dependencies:** T-0302, T-0202

**Tasks:**

- Add watchlist preview to dashboard.
- Create `/watchlist` page.
- Show watchlist table.
- Add remove action.
- Add empty state.

**Acceptance Criteria:**

- Watchlist page shows saved coins.
- Remove action works.
- Empty state is clear.

---

## M-04 — Coin Detail and Chart

### T-0401 — Build Coin Detail Route

**Priority:** Must Have  
**Type:** Page  
**Dependencies:** T-0104, T-0202

**Tasks:**

- Create `/coin/[symbol]` route.
- Fetch metadata by symbol.
- Show coin header and market stats.
- Handle invalid symbol.

**Acceptance Criteria:**

- Valid symbol displays detail page.
- Invalid symbol shows controlled error or not-found state.

---

### T-0402 — Build Price Chart Component

**Priority:** Must Have  
**Type:** UI  
**Dependencies:** T-0105

**Tasks:**

- Integrate TradingView Lightweight Charts.
- Render line chart from historical data.
- Add tooltip.
- Add responsive behavior.

**Acceptance Criteria:**

- Chart renders historical price.
- Chart resizes correctly.
- Chart does not crash with empty data.

---

### T-0403 — Build Timeframe Selector

**Priority:** Must Have  
**Type:** UI  
**Dependencies:** T-0402

**Tasks:**

- Add 1H, 24H, 7D, 30D selectors.
- Refetch chart data on timeframe change.
- Show loading state during change.

**Acceptance Criteria:**

- Timeframe switch updates chart.
- Current timeframe is visually active.

---

### T-0404 — Add Watchlist and Alert Actions to Coin Detail

**Priority:** Should Have  
**Type:** UI  
**Dependencies:** T-0302, T-0601

**Tasks:**

- Add add/remove watchlist button.
- Add create alert button/modal entry point.

**Acceptance Criteria:**

- Watchlist action works from coin detail.
- Alert entry point opens correct form.

---

## M-05 — Portfolio Tracker

### T-0501 — Build Portfolio Store

**Priority:** Should Have  
**Type:** State  
**Dependencies:** T-0103

**Tasks:**

- Create Zustand portfolio store.
- Persist holdings to localStorage.
- Add actions: add, update, delete.
- Validate quantity and buy price.

**Acceptance Criteria:**

- Holdings persist after refresh.
- Invalid quantity is rejected.

---

### T-0502 — Implement Portfolio Calculations

**Priority:** Should Have  
**Type:** Logic  
**Dependencies:** T-0501, T-0202

**Tasks:**

- Calculate current holding value.
- Calculate total portfolio value.
- Calculate P/L nominal.
- Calculate P/L percentage.

**Acceptance Criteria:**

- Calculations are correct for positive, zero, and missing buy price cases.
- Unit tests cover calculation logic.

---

### T-0503 — Build Portfolio Page

**Priority:** Should Have  
**Type:** Page  
**Dependencies:** T-0501, T-0502

**Tasks:**

- Create `/portfolio` page.
- Add portfolio summary cards.
- Add holdings table.
- Add add/edit holding form.
- Add delete action.

**Acceptance Criteria:**

- User can add, edit, and delete holdings.
- Total value updates from live price.
- Empty state is available.

---

## M-06 — Price Alerts

### T-0601 — Build Alert Store

**Priority:** Should Have  
**Type:** State  
**Dependencies:** T-0103

**Tasks:**

- Create Zustand alert store.
- Persist alerts to localStorage.
- Add actions: create, delete, mark triggered.
- Validate target price and condition.

**Acceptance Criteria:**

- Alerts persist after refresh.
- Invalid alerts are rejected.

---

### T-0602 — Implement Alert Trigger Logic

**Priority:** Should Have  
**Type:** Logic  
**Dependencies:** T-0601, T-0202

**Tasks:**

- Evaluate active alerts against live price.
- Trigger once per alert.
- Mark alert as triggered.
- Unit test trigger conditions.

**Acceptance Criteria:**

- Greater-than and less-than alerts trigger correctly.
- Triggered alert does not repeatedly notify.

---

### T-0603 — Implement Browser Notification Flow

**Priority:** Should Have  
**Type:** Integration  
**Dependencies:** T-0602

**Tasks:**

- Request notification permission.
- Show permission state.
- Send browser notification when alert triggers.
- Handle denied permission gracefully.

**Acceptance Criteria:**

- Notification appears when permission is granted.
- Denied permission does not crash app.

---

### T-0604 — Build Alerts Page

**Priority:** Should Have  
**Type:** Page  
**Dependencies:** T-0601, T-0603

**Tasks:**

- Create `/alerts` page.
- Add alert creation form.
- Add active alerts list.
- Add triggered alerts list.
- Add delete action.

**Acceptance Criteria:**

- User can create and delete alerts.
- Active and triggered statuses are visible.

---

## M-07 — Fear & Greed

### T-0701 — Implement Fear & Greed API Client

**Priority:** Should Have  
**Type:** Integration  
**Dependencies:** T-0101

**Tasks:**

- Fetch current Fear & Greed Index.
- Normalize value, label, and timestamp.
- Add query cache with daily refresh behavior.

**Acceptance Criteria:**

- API returns normalized sentiment data.
- Failure returns controlled error state.

---

### T-0702 — Build Fear & Greed Widget

**Priority:** Should Have  
**Type:** UI  
**Dependencies:** T-0701

**Tasks:**

- Show score.
- Show label.
- Show visual gauge or progress indicator.
- Show last updated timestamp.
- Add fallback state.

**Acceptance Criteria:**

- Widget renders score and label.
- API failure does not break dashboard.

---

## M-08 — Technical Analysis

### T-0801 — Implement Moving Average Calculation

**Priority:** Should Have  
**Type:** Logic  
**Dependencies:** T-0105

**Tasks:**

- Implement MA calculation for period 7, 25, 99.
- Return series compatible with chart.
- Add unit tests.

**Acceptance Criteria:**

- MA outputs correct values for known input.
- Insufficient data returns controlled result.

---

### T-0802 — Implement RSI Calculation

**Priority:** Should Have  
**Type:** Logic  
**Dependencies:** T-0105

**Tasks:**

- Implement RSI calculation.
- Add overbought/oversold/neutral classification.
- Add unit tests.

**Acceptance Criteria:**

- RSI classification follows PRD rules.
- Insufficient data handled safely.

---

### T-0803 — Implement MACD Calculation

**Priority:** Should Have  
**Type:** Logic  
**Dependencies:** T-0105

**Tasks:**

- Implement MACD line.
- Implement signal line.
- Implement histogram.
- Add unit tests.

**Acceptance Criteria:**

- MACD returns expected series shape.
- Empty or short data does not crash.

---

### T-0804 — Implement Support and Resistance Logic

**Priority:** Should Have  
**Type:** Logic  
**Dependencies:** T-0105

**Tasks:**

- Calculate simple local high resistance.
- Calculate simple local low support.
- Add unit tests.

**Acceptance Criteria:**

- Support/resistance output is stable for known candles.
- Insufficient data handled safely.

---

### T-0805 — Build Technical Analysis UI

**Priority:** Should Have  
**Type:** UI  
**Dependencies:** T-0801, T-0802, T-0803, T-0804

**Tasks:**

- Add indicator toggles.
- Render MA overlays on chart.
- Render RSI panel.
- Render MACD panel.
- Render support/resistance levels.
- Add technical summary panel.
- Add financial disclaimer.

**Acceptance Criteria:**

- User can toggle indicators.
- Indicators update by symbol and timeframe.
- Technical summary avoids buy/sell recommendations.

---

## M-09 — Quality and Release

### T-0901 — Add Testing Infrastructure

**Priority:** Must Have  
**Type:** Quality  
**Dependencies:** T-0003

**Tasks:**

- Configure Vitest.
- Configure Testing Library.
- Configure Playwright if E2E is included.
- Add sample tests.

**Acceptance Criteria:**

- Test command runs successfully.
- Sample unit/component test passes.

---

### T-0902 — Add Core Unit Tests

**Priority:** Must Have  
**Type:** Quality  
**Dependencies:** M-05, M-06, M-08

**Tasks:**

- Test portfolio calculations.
- Test alert trigger logic.
- Test indicator calculations.
- Test formatting utilities.
- Test storage safe parsing.

**Acceptance Criteria:**

- Critical business logic has unit test coverage.
- Tests pass locally and in CI.

---

### T-0903 — Accessibility Pass

**Priority:** Must Have  
**Type:** Quality  
**Dependencies:** M-02, M-03, M-04, M-05, M-06

**Tasks:**

- Check contrast.
- Check keyboard navigation.
- Ensure forms have labels.
- Ensure buttons have accessible names.
- Ensure price movement is not color-only.

**Acceptance Criteria:**

- Main flows are keyboard usable.
- Text contrast meets basic requirements.

---

### T-0904 — Performance Pass

**Priority:** Must Have  
**Type:** Quality  
**Dependencies:** M-02, M-04, M-08

**Tasks:**

- Check initial load performance.
- Optimize chart rendering.
- Reduce unnecessary rerenders from WebSocket updates.
- Memoize expensive indicator calculations.

**Acceptance Criteria:**

- Dashboard remains responsive with 20 tracked assets.
- Chart interaction remains smooth.

---

### T-0905 — Configure Deployment

**Priority:** Must Have  
**Type:** DevOps  
**Dependencies:** M-02

**Tasks:**

- Create Vercel project.
- Configure environment variables if needed.
- Configure preview deploys.
- Configure production deploy from `main`.

**Acceptance Criteria:**

- App deploys successfully to preview.
- Production build succeeds.

---

### T-0906 — Configure CI Pipeline

**Priority:** Must Have  
**Type:** DevOps  
**Dependencies:** T-0003, T-0901

**Tasks:**

- Add GitHub Actions workflow.
- Run install, typecheck, lint, test, build.
- Block failed checks from release.

**Acceptance Criteria:**

- CI runs on pull request.
- CI fails on typecheck/lint/test/build failure.

---

## 5. Release Checklist

Before MVP release:

- [ ] App builds successfully.
- [ ] Lint passes.
- [ ] Typecheck passes.
- [ ] Core unit tests pass.
- [ ] Dashboard loads without console errors.
- [ ] Live price updates work.
- [ ] Reconnect behavior tested.
- [ ] Search works.
- [ ] Watchlist persists after refresh.
- [ ] Coin detail opens correctly.
- [ ] Chart timeframe switching works.
- [ ] Portfolio calculations verified.
- [ ] Alerts trigger when browser active.
- [ ] Fear & Greed fallback tested.
- [ ] Technical indicators handle insufficient data.
- [ ] Mobile responsive smoke test completed.
- [ ] Financial disclaimer visible.
- [ ] Production deployment verified.

---

## 6. Recommended Sprint Plan

### Sprint 0 — Spikes and Decisions

- M-00A Technical Spikes.
- Confirm CoinRegistry approach.
- Confirm WebSocket and chart feasibility.

### Sprint 1 — Foundation and Data

- M-00 Project Foundation.
- M-01 Data Layer.
- Basic layout shell.

### Sprint 2 — Dashboard and Watchlist

- M-02 Dashboard MVP.
- M-03 Search and Watchlist.

### Sprint 3 — Coin Detail and Portfolio

- M-04 Coin Detail and Chart.
- M-05 Portfolio Tracker.

### Sprint 4 — Alerts and Technical Analysis

- M-06 Price Alerts.
- M-07 Fear & Greed.
- M-08 Technical Analysis.

### Sprint 5 — Quality and Release

- M-09 Quality and Release.
- Accessibility, performance, testing, deployment.

---

## 7. Engineering Notes

- Prioritize type safety early. Fixing loose types later is expensive.
- Keep indicator logic pure and tested.
- Avoid coupling UI components directly to external API response shapes.
- Normalize all external data at API boundary.
- Keep localStorage access behind utility functions.
- Do not store live price stream in localStorage.
- Do not introduce backend until there is a clear product need.
- Avoid financial advice language in UI copy.
