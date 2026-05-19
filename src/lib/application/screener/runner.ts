/**
 * @deprecated New code should import from `./use-cases/run-screener-cycle`.
 * This file is kept as a thin re-export so existing callers in
 * `scripts/screener/start.ts` and `./scheduler.ts` keep working without
 * modification.
 *
 * The procedural runner that previously lived here was decomposed into:
 *   - `./use-cases/run-screener-cycle.ts` — orchestration (use case)
 *   - `./mappers/normalize-result.ts` — pure DTO mapping + freshness calc
 *   - `./ports.ts` — explicit port interfaces
 *
 * See `architecture-assessment.md` for the rationale (Phase 2 / F2).
 */
export {
  runScreenerCycle,
  type ScreenerRunResult,
} from './use-cases/run-screener-cycle';
