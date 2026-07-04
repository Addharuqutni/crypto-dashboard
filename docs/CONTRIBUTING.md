# Contributing

<!-- AUTO-GENERATED: setup-from-package-json:start -->
## Development setup

Prerequisites:

- Node.js >=22
- npm >=10

Install and verify:

```bash
npm ci
npm run check
```

Start local development:

```bash
npm run dev
```

For the production-like local server, build first:

```bash
npm run build
npm run start:local
```
<!-- AUTO-GENERATED: setup-from-package-json:end -->

<!-- AUTO-GENERATED: scripts-from-package-json:start -->
## Available scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start Next.js dev server with Turbopack. |
| `npm run dev:webpack` | Start Next.js dev server with webpack. |
| `npm run build` | Build production app with Turbopack. |
| `npm run build:webpack` | Build production app with webpack. |
| `npm run start` | Start built Next.js production server. |
| `npm run start:local` | Start built Next.js production server on port 3000. |
| `npm run lint` | Run ESLint for `src/`. |
| `npm run typecheck` | Run TypeScript check without emitting files. |
| `npm run test` | Run Vitest once. |
| `npm run test:watch` | Run Vitest in watch mode. |
| `npm run test:e2e` | Run Playwright end-to-end tests. |
| `npm run worker` | Start Telegram/worker process. |
| `npm run screener` | Start screener process. |
| `npm run agent` | Start AI agent process. |
| `npm run check` | Run typecheck, lint, and tests. |
| `npm run audit:prod` | Run production dependency audit. |
| `npm run start:prod` | Start standalone production server via `scripts/start-prod.mjs`. |
| `npm run deploy:vps` | Run VPS deployment script. |
<!-- AUTO-GENERATED: scripts-from-package-json:end -->

<!-- AUTO-GENERATED: testing-from-package-json:start -->
## Testing

Run the full local gate:

```bash
npm run check
```

Targeted checks:

```bash
npm run typecheck
npm run lint
npm run test
npm run test:e2e
```

Place unit tests next to the code they cover using the existing `__tests__` convention. Place browser journeys under `e2e/`.
<!-- AUTO-GENERATED: testing-from-package-json:end -->

<!-- AUTO-GENERATED: style-from-package-json:start -->
## Code style

- ESLint: `npm run lint`
- TypeScript: `npm run typecheck`
- Formatter dependency: Prettier is installed; no package script currently wraps it.
- Pre-commit hooks: none declared in `package.json`.
<!-- AUTO-GENERATED: style-from-package-json:end -->

<!-- AUTO-GENERATED: pr-checklist:start -->
## PR checklist

- [ ] `npm run check` passes.
- [ ] `npm run test:e2e` passes when UI flows changed.
- [ ] Environment docs updated when `.env*.example` or `deploy/vps.env.example` changes.
- [ ] Deployment docs updated when `deploy/`, `ecosystem.config.cjs`, or production scripts change.
- [ ] No secrets committed.
<!-- AUTO-GENERATED: pr-checklist:end -->
