# Security Notes

Last reviewed: 2026-05-18

## npm audit status

Command reviewed:

```bash
npm audit --omit=dev --json
```

Current result: **2 moderate production audit findings**.

The findings are the same transitive issue and are both reported through `next`:

| Package path | Severity | Advisory | Impact |
|---|---:|---|---|
| `next > postcss` (`node_modules/next/node_modules/postcss`) | Moderate | GHSA-qx2v-qp2m-jg93 | PostCSS `<8.5.10` can produce XSS via unescaped `</style>` in CSS stringify output. |
| `next` | Moderate | via nested `postcss` | npm reports `next` as affected because it vendors/depends on the vulnerable nested PostCSS range. |

## Why no automatic fix was applied

`npm audit` reports the available fix as:

```text
next@9.3.3 (semver-major downgrade)
```

This is not a safe remediation for this application:

- The app currently uses `next@^16.2.6`.
- Downgrading to Next 9 would break the App Router, React 19 integration, build pipeline, and many framework APIs.
- Running `npm audit fix --force` would violate the guardrail against blind forced dependency changes.

## Current mitigation

- The app does not expose a CSS-authoring API to untrusted users.
- CSS is authored in the repository and compiled by the framework build pipeline.
- No user-supplied CSS is intentionally passed through PostCSS stringify.
- CI now runs typecheck, lint, tests, and production build on every push/PR.
- The direct `postcss` dev dependency is already `^8.5.14`, which is above the vulnerable range; the remaining issue is nested under `next`.

## Follow-up plan

1. Track the next stable Next.js release that updates its nested PostCSS dependency to `>=8.5.10`.
2. Re-run:

   ```bash
   npm audit --omit=dev
   npm outdated next eslint eslint-config-next typescript react react-dom
   ```

3. Apply only forward-compatible framework updates.
4. Re-run the required checks:

   ```bash
   npm run typecheck
   npm run lint
   npm test
   npm run build
   npm audit --omit=dev
   ```

5. Remove this note only after `npm audit --omit=dev` no longer reports the nested Next/PostCSS issue.

## Version compatibility review

Current stack from `package.json`:

| Package | Version | Note |
|---|---:|---|
| `next` | `^16.2.6` | Bleeding-edge Next 16. Build uses `next build --webpack`; Turbopack script remains optional. |
| `react` / `react-dom` | `^19.2.6` | Aligned with Next 16-era React 19 usage. |
| `typescript` | `^6.0.3` | Strict mode is enabled and local `npm run typecheck` passes. |
| `eslint` | `^10.3.0` | Flat config is in use; local lint passes. |
| `eslint-config-next` | `^16.2.6` | Matched to the Next major/minor line. |
| `vitest` | `^3.2.4` | Test suite passes on Windows locally. |

CI pins Node to `24` to match the local development runtime observed during this review (`node v24.13.1`, `npm 11.8.0`).
