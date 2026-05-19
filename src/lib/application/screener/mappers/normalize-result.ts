import type { Candle } from '@/types/chart';
import type { FuturesSignal } from '@/types/futures-signal';
import type {
  ScreenerConfig,
  ScreenerFreshnessMetadata,
  ScreenerResult,
  ScreenerUniverseCoin,
} from '../types';

/**
 * Pure mapping helpers used by the screener use case.
 *
 * Kept side-effect free and adapter-free so they can be unit-tested
 * without touching network or filesystem. The use case orchestrator
 * fetches data, runs the engine, and then funnels everything here.
 */

interface NormalizeArgs {
  coin: ScreenerUniverseCoin;
  config: ScreenerConfig;
  signal: FuturesSignal;
  setupCandles: Candle[];
  macroCandles: Candle[];
  triggerCandles: Candle[];
  runnerWarnings: string[];
  evaluatedAt: number;
}

/**
 * Map the engine's `FuturesSignal` into the flat `ScreenerResult` shape.
 *
 * Never fabricates entry/SL/TP — passes through engine output as-is.
 * Combines engine warnings with runner warnings (e.g. `funding_unavailable`)
 * so the UI can surface degraded context.
 */
export function normalizeResult({
  coin,
  config,
  signal,
  setupCandles,
  macroCandles,
  triggerCandles,
  runnerWarnings,
  evaluatedAt,
}: NormalizeArgs): ScreenerResult {
  const lastSetup = setupCandles[setupCandles.length - 1];

  // Combine warnings: engine first, then runner-specific.
  const combinedWarnings = [...(signal.warnings ?? []), ...runnerWarnings];

  return {
    symbol: coin.symbol,
    baseAsset: coin.baseAsset,
    quoteAsset: coin.quoteAsset,
    marketCapRank: coin.marketCapRank,
    setupTimeframe: config.setupTimeframe,
    triggerTimeframe: config.triggerTimeframe,
    macroTimeframe: config.macroTimeframe,
    evaluatedAt,
    candleCloseTime: lastSetup?.closeTime ?? null,
    dataHealth: signal.dataHealth,
    action: signal.action,
    confidence: signal.confidence ?? signal.confidenceScore ?? 0,
    grade: signal.grade ?? 'D',
    entry: signal.entryZone?.min ?? null,
    stopLoss: signal.stopLoss ?? null,
    takeProfits: [
      signal.takeProfits?.tp1 ?? null,
      signal.takeProfits?.tp2 ?? null,
      signal.takeProfits?.tp3 ?? null,
    ],
    riskReward: signal.riskRewardRatio ?? null,
    marketRegime: signal.marketRegime ?? 'unknown',
    tradePermission: signal.tradePermission ?? 'no_trade',
    reasons: signal.reasons ?? [],
    noTradeReasons: signal.noTradeReasons ?? [],
    fundingRate: signal.positioning?.fundingRate ?? null,
    openInterestChangePercent: signal.positioning?.openInterestChangePercent ?? null,
    mtfAlignmentScore: signal.mtfConfirmation?.alignmentScore ?? null,
    warnings: combinedWarnings,
    freshness: computeFreshness(signal, setupCandles, macroCandles, triggerCandles, evaluatedAt),
  };
}

/**
 * Compute freshness metadata for UI display.
 *
 * Setup/macro/trigger ages come from the latest candle close vs `evaluatedAt`.
 * Funding/OI ages come from the engine's data-health gate when available.
 */
export function computeFreshness(
  signal: FuturesSignal,
  setupCandles: Candle[],
  macroCandles: Candle[],
  triggerCandles: Candle[],
  evaluatedAt: number
): ScreenerFreshnessMetadata {
  return {
    setupCandleAgeSec: ageSec(setupCandles[setupCandles.length - 1]?.closeTime, evaluatedAt),
    macroCandleAgeSec: ageSec(macroCandles[macroCandles.length - 1]?.closeTime, evaluatedAt),
    triggerCandleAgeSec: ageSec(triggerCandles[triggerCandles.length - 1]?.closeTime, evaluatedAt),
    fundingAgeSec: signal.dataHealth?.funding?.ageSec ?? null,
    openInterestAgeSec: signal.dataHealth?.openInterest?.ageSec ?? null,
  };
}

/** Compute age in seconds between a closeTime and now. Null when unknown. */
function ageSec(closeTimeMs: number | undefined, nowMs: number): number | null {
  if (closeTimeMs == null || !Number.isFinite(closeTimeMs)) return null;
  return Math.max(0, Math.round((nowMs - closeTimeMs) / 1000));
}
