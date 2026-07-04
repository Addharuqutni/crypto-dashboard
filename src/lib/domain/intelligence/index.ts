/**
 * Public barrel for the intelligence module.
 *
 * The intelligence layer is strictly deterministic: market context, setup
 * ranking, risk-profile presets, and the no-trade explainer are pure
 * functions over engine output. The AI auditor is the only LLM-touching
 * piece, and it can only EXPLAIN the deterministic output — never override
 * it.
 */

export { buildMarketContext } from './market-context';
export { rankSetup } from './setup-ranking';
export { applyProfile, getRiskProfile } from './risk-profile';
export { explainNoTrade } from './no-trade';
export { buildAuditorUserPrompt, parseAuditorResponse } from './ai-auditor';
export type { AiAuditorInput } from '@/types/intelligence';
