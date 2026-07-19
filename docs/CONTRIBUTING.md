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
| `npm run lint` | ESLint over `src/` |
| `npm run typecheck` | TypeScript check (`tsc --noEmit`) |
| `npm test` | Vitest unit/integration suite (single run) |
| `npm run test:watch` | Vitest watch mode |
| `npm run test:e2e` | Playwright end-to-end tests |
| `npm run worker` | Telegram alert worker |
| `npm run agent` | Run the optional TypeScript AI agent |
| `npm run python-agent` | Start the Python Action Call service |
| `npm run check` | `typecheck` + `lint` + `test` |
| `npm run clean` | Remove local build and test artifacts |
| `npm run audit:prod` | Audit production dependencies |
| `npm run start:prod` | Start the standalone production server |
| `npm run deploy:vps` | Deploy to a VPS (`deploy/deploy-vps.sh`) |
| `npm run run:vps` | Deploy and optionally configure a domain |
| `npm run setup:domain` | Configure nginx and optional TLS |
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

The repository's quality gate is `typecheck`, `lint`, `test`, and `build`. Run it locally before opening a PR; CI configuration may vary by deployment environment.

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

- Python Action Call is the **sole** signal/screener engine. AI may explain or audit — never override the Python decision.
- Production path: PM2 `crypto-dashboard-python-screener` (`scripts/python-agent/worker.sh`) and `crypto-dashboard-python-agent` (`scripts/python-agent/start.sh`) own cycles; Next.js `/api/screener` and `/api/action-call` proxy `PYTHON_AGENT_URL`.
- Optional Basic Auth is enforced in [`src/proxy.ts`](../src/proxy.ts).
