import type { ScreenerAiAuditSummary, RankedScreenerResult } from '@/lib/application/screener/types';
import type { AgentSignalContext } from './agent-types';

export function buildSignalContext(
  result: RankedScreenerResult,
  audit?: ScreenerAiAuditSummary
): AgentSignalContext {
  return {
    symbol: result.symbol,
    action: result.action,
    timeframe: result.setupTimeframe,
    price: result.currentPrice,
    confidence: result.confidence,
    grade: result.grade,
    rankingScore: result.rankingScore,
    riskReward: result.riskReward,
    marketRegime: result.marketRegime,
    tradePermission: result.tradePermission,
    mtfAlignmentScore: result.mtfAlignmentScore,
    dataHealthOk: result.dataHealth.ok,
    reasons: result.reasons.slice(0, 6),
    warnings: result.warnings.slice(0, 6),
    noTradeReasons: result.noTradeReasons.slice(0, 6),
    entry: result.entry,
    stopLoss: result.stopLoss,
    takeProfits: result.takeProfits,
    audit,
  };
}

export function buildSignalContexts(
  results: RankedScreenerResult[],
  audits?: Record<string, ScreenerAiAuditSummary>
): AgentSignalContext[] {
  return results.map((result) => buildSignalContext(result, audits?.[result.symbol]));
}
