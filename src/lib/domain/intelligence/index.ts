/**
 * Public barrel for the intelligence module.
 *
 * The intelligence layer is strictly deterministic: market context, setup
 * ranking, risk-profile presets, and the no-trade explainer are pure
 * functions over engine output. The AI auditor is the only LLM-touching
 * piece, and it can only EXPLAIN the deterministic output — never override
 * it.
 */

export {
  buildMarketContext,
  type BuildMarketContextInput,
} from './market-context';
export { rankSetup, type SetupRankingInput } from './setup-ranking';
export {
  RISK_PROFILES,
  getRiskProfile,
  applyProfile,
  type DisciplineThresholds,
} from './risk-profile';
export { explainNoTrade } from './no-trade';
export {
  AUDITOR_SYSTEM_PROMPT,
  buildAuditorUserPrompt,
  parseAuditorResponse,
  AiAuditorParseError,
} from './ai-auditor';

export type {
  AiAuditorInput,
  AiAuditorReport,
  FundingRegime,
  MarketContext,
  MarketRiskMode,
  NoTradeExplanation,
  OpenInterestRegime,
  RiskProfile,
  RiskProfileId,
  SetupGrade,
  SetupRanking,
  SetupRankingBreakdown,
  VolatilityRegime,
} from '@/types/intelligence';
