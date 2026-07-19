# Contributing

## Prerequisites

- Node.js `>=22.0.0`
- npm `>=10.0.0`
- Internet access for Binance Futures, CoinGecko, and Alternative.me

## Setup

```bash
npm install
cp .env.example .env.local
# Edit secrets as needed — see docs/ENV.md
npm run dev
```

Open `http://localhost:3000`.

## Scripts

<!-- AUTO-GENERATED:package.json scripts -->
| Command | Description |
|---------|-------------|
| `npm run dev` | Start Next.js development server with Turbopack |
| `npm run dev:webpack` | Start development server with Webpack |
| `npm run build` | Production build with Turbopack |
| `npm run build:webpack` | Production build with Webpack |
| `npm start` | Start standard Next.js production server |
| `npm run start:local` | Start production server on port 3000 |
| `npm run start:prod` | Start standalone production server from `.next/standalone` |
| `npm run lint` | ESLint over `src/` |
| `npm run typecheck` | TypeScript check (`tsc --noEmit`) |
| `npm test` | Vitest unit/integration suite (single run) |
| `npm run test:watch` | Vitest watch mode |
| `npm run test:e2e` | Playwright end-to-end tests |
| `npm run check` | `typecheck` + `lint` + `test` |
| `npm run audit:prod` | `npm audit --omit=dev` |
| `npm run screener` | Long-running screener process |
| `npm run screener -- --once` | One screener cycle, then exit |
| `npm run agent` | AI Signal Agent against latest screener snapshot |
| `npm run worker` | Telegram alert worker |
| `npm run deploy:vps` | VPS deploy helper (`deploy/deploy-vps.sh`) |
<!-- /AUTO-GENERATED -->

## Quality Gate

Before opening a PR, run the full gate (matches CI):

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

Or the shortcut:

```bash
npm run check
```

CI workflow: [`.github/workflows/ci.yml`](../.github/workflows/ci.yml) runs typecheck, lint, test, and build on push/PR to `main`/`master`.

## Testing

### Unit / integration (Vitest)

- Config: [`vitest.config.ts`](../vitest.config.ts)
- Tests live next to code under `src/**/__tests__/` and co-located `*.test.ts`
- Prefer Arrange-Act-Assert structure
- Domain logic (signal engine, ranker, journal PnL, storage helpers) should stay pure and unit-tested

```bash
npm test
npm run test:watch
```

### End-to-end (Playwright)

```bash
npm run test:e2e
```

Config: [`playwright.config.ts`](../playwright.config.ts).

### Writing new tests

1. Place unit tests beside the module under `__tests__/`.
2. Mock network boundaries (`fetch`, WebSocket) — do not hit live exchanges in CI.
3. Keep fixtures small and deterministic; avoid wall-clock flakiness (inject clocks when needed).

## Code Style

- TypeScript strict mode, path alias `@/` → `src/`
- ESLint: [`eslint.config.mjs`](../eslint.config.mjs)
- Prettier: [`.prettierrc`](../.prettierrc)
- Prefer immutable updates, early returns, and small focused modules
- Do not add comments that restate the code; document non-obvious WHY only
- No hardcoded secrets — use env vars documented in [`docs/ENV.md`](./ENV.md)

### Layering

```text
src/
  app/            # Next.js routes + API handlers
  components/     # UI
  hooks/          # React hooks
  stores/         # Zustand client state
  types/          # Shared types
  lib/
    domain/       # Pure business logic (signals, indicators, intelligence)
    application/  # Use-cases, workers, screener orchestration
    adapters/     # External I/O (Binance, AI, storage, websocket)
    shared/       # Cross-cutting helpers (formatting, a11y, security)
```

- Domain code must stay free of Next.js/React imports and network I/O.
- Adapters own external APIs; application layer orchestrates them.

## PR Checklist

- [ ] `npm run check` passes locally
- [ ] New/changed logic has tests when behavior is non-trivial
- [ ] Env vars documented in `docs/ENV.md` if introduced
- [ ] No secrets or local data (`data/`, `.env.local`) committed
- [ ] Conventional commit style: `feat:`, `fix:`, `refactor:`, `docs:`, `test:`, `chore:`, `perf:`, `ci:`
- [ ] PR description covers why + test plan

## Architecture Notes

- Futures signal engine is **deterministic**. AI may explain or audit — never override `LONG` / `SHORT` / `WAIT`.
- Screener production path: separate process writes `data/screener/latest.json`; Next.js serves it via `/api/screener` in `file` mode.
- Optional Basic Auth is enforced in [`src/proxy.ts`](../src/proxy.ts).
