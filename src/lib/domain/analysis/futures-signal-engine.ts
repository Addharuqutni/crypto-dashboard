/**
 * Futures Signal Engine V2 — Public API.
 *
 * This module is the canonical entry point used by consumers throughout the
 * app (coin detail page, worker runner, historical validation runner, tests). It
 * re-exports `generateFuturesSignal` from the decomposed pipeline so that
 * all existing `import { generateFuturesSignal } from '…/futures-signal-engine'`
 * statements continue working without modification.
 *
 * The implementation lives in `./engine/pipeline.ts` with sub-modules for
 * scoring, explanation, and WAIT-signal assembly. This file intentionally
 * contains zero logic — only re-exports — so audits and reviews stay focused
 * on the responsible sub-module.
 *
 * @see ./engine/pipeline.ts   — orchestration
 * @see ./engine/scoring.ts    — sub-score computation + weighting
 * @see ./engine/explain.ts    — human-readable reasons + summary
 * @see ./engine/wait-signal.ts — WAIT signal builders + defaults
 * @see ./engine/utils.ts      — shared numeric helpers
 */
export { generateFuturesSignal } from './engine/pipeline';
