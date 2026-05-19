import type { Candle } from '@/types/chart';
import type {
  FuturesDataHealth,
  FuturesEntryStatus,
  FuturesLiquiditySweep,
  FuturesMarketRegimeId,
  FuturesMtfConfirmation,
  FuturesPositioning,
  FuturesRiskApproval,
  FuturesSignal,
  FuturesSignalGrade,
  FuturesSignalScoreBreakdown,
  FuturesTradePermission,
} from '@/types/futures-signal';
import type { RegimeContext } from '../regime-detector';
import { rankNoTradeReasons, type NoTradeReason } from '../no-trade-rank';
import { gradeSignal } from '../signal-grade';
import { toCoarseGrade } from '../regime-permission';
import { clamp } from './utils';

/**
 * Common WAIT-emit context built by every gate inside the pipeline before
 * `dataHealth`, `marketRegime`, and `tradePermission` are mixed in.
 *
 * Kept here so the pipeline can stay focused on gate logic and `finalizeWait`
 * can stay focused on assembling the strict-pipeline output shape.
 */
export interface GateWaitArgs {
  regime: FuturesSignal['regime'];
  summary: string;
  breakdown: FuturesSignalScoreBreakdown;
  reasons: string[];
  warnings: string[];
  confidence: number;
  mtf: FuturesMtfConfirmation;
  liquiditySweep: FuturesLiquiditySweep;
  positioning: FuturesPositioning;
  candidateSide: 'LONG' | 'SHORT';
  candles: Candle[];
  regimeCtx: RegimeContext;
  ranked: NoTradeReason[];
  /** Defaults to 'not_triggered' inside `finalizeWait`. */
  entryStatus?: FuturesEntryStatus;
  /** Defaults to 'not_applicable' inside `finalizeWait`. */
  riskApproval?: FuturesRiskApproval;
}

/**
 * Strict-pipeline WAIT context. Identical to `GateWaitArgs` plus the three
 * data-health-driven fields the pipeline computed up-front.
 */
export interface FinalizeWaitArgs extends GateWaitArgs {
  dataHealth: FuturesDataHealth;
  marketRegime: FuturesMarketRegimeId;
  tradePermission: FuturesTradePermission;
}

/**
 * Build the full WAIT signal for a gate that has already produced sub-scores
 * and accumulated reasons/warnings.
 *
 * Caps confidence at `dataHealth.confidenceCap` so a stale-secondary-data
 * setup cannot publish a top-tier confidence number.
 */
export function finalizeWait(args: FinalizeWaitArgs): FuturesSignal {
  const { reasons: rankedMessages, primary } = rankNoTradeReasons(args.ranked);
  const grade: FuturesSignalGrade = gradeSignal({
    action: 'WAIT',
    finalScore: args.confidence,
    riskLevel: 'NO_TRADE',
    mtf: args.mtf,
    warningsCount: args.warnings.length,
  });

  const cappedConfidence = Math.min(args.confidence, args.dataHealth.confidenceCap);
  const confidenceOut = clamp(Math.round(cappedConfidence), 0, 100);

  return {
    action: 'WAIT',
    confidenceScore: confidenceOut,
    signalGrade: grade,
    entryTrigger: 'NO_TRIGGER',
    regime: args.regime,
    entryZone: { min: null, max: null },
    stopLoss: null,
    takeProfits: { tp1: null, tp2: null, tp3: null },
    riskRewardRatio: null,
    suggestedLeverage: { min: 0, max: 0 },
    riskLevel: 'NO_TRADE',
    invalidationReason: primary ?? args.summary,
    summary: args.summary,
    reasons: args.reasons,
    warnings: args.warnings,
    noTradeReasons: rankedMessages,
    primaryNoTradeReason: primary,
    mtfConfirmation: args.mtf,
    positioning: args.positioning,
    liquiditySweep: args.liquiditySweep,
    scoreBreakdown: { ...args.breakdown, finalScore: args.confidence },

    // Strict pipeline outputs.
    confidence: confidenceOut,
    grade: toCoarseGrade(grade),
    marketRegime: args.marketRegime,
    tradePermission: args.tradePermission,
    dataHealth: args.dataHealth,
    entryStatus: args.entryStatus ?? 'not_triggered',
    riskApproval: args.riskApproval ?? 'not_applicable',
    invalidation: null,
    reason: args.reasons,
  };
}

/**
 * Lightweight WAIT context used before any score has been computed (e.g. when
 * the data-health gate fails outright).
 */
export interface WaitArgs {
  regime: FuturesSignal['regime'];
  reason: string;
  summary: string;
  mtf: FuturesMtfConfirmation;
  liquiditySweep: FuturesLiquiditySweep;
  noTradeReasons: NoTradeReason[];
  dataHealth: FuturesDataHealth;
  marketRegime: FuturesMarketRegimeId;
  tradePermission: FuturesTradePermission;
  entryStatus: FuturesEntryStatus;
  riskApproval: FuturesRiskApproval;
}

/**
 * Lightweight WAIT path used by the earliest pipeline exits (no score, no
 * positioning, no entry trigger). Returns a fully-populated `FuturesSignal`
 * so callers always get the strict-pipeline shape.
 */
export function waitSignal(args: WaitArgs): FuturesSignal {
  const ranked = rankNoTradeReasons(args.noTradeReasons);
  const cap = args.dataHealth.confidenceCap;
  const confidenceOut = clamp(Math.round(Math.min(0, cap)), 0, 100);
  return {
    action: 'WAIT',
    confidenceScore: confidenceOut,
    signalGrade: 'D',
    entryTrigger: 'NO_TRIGGER',
    regime: args.regime,
    entryZone: { min: null, max: null },
    stopLoss: null,
    takeProfits: { tp1: null, tp2: null, tp3: null },
    riskRewardRatio: null,
    suggestedLeverage: { min: 0, max: 0 },
    riskLevel: 'NO_TRADE',
    invalidationReason: ranked.primary ?? args.reason,
    summary: args.summary,
    reasons: [],
    warnings: [],
    noTradeReasons: ranked.reasons,
    primaryNoTradeReason: ranked.primary,
    mtfConfirmation: args.mtf,
    positioning: {
      fundingRate: null,
      fundingBias: 'UNAVAILABLE',
      openInterestChangePercent: null,
      openInterestBias: 'UNAVAILABLE',
    },
    liquiditySweep: args.liquiditySweep,
    scoreBreakdown: {
      trendScore: 0,
      momentumScore: 0,
      volumeScore: 0,
      structureScore: 0,
      riskScore: 0,
      finalScore: 0,
    },

    // Strict pipeline outputs.
    confidence: confidenceOut,
    grade: 'D',
    marketRegime: args.marketRegime,
    tradePermission: args.tradePermission,
    dataHealth: args.dataHealth,
    entryStatus: args.entryStatus,
    riskApproval: args.riskApproval,
    invalidation: null,
    reason: [],
  };
}

/** Empty MTF confirmation used by the data-health WAIT path. */
export function emptyMtf(): FuturesMtfConfirmation {
  return {
    macroBias: 'INSUFFICIENT_DATA',
    setupBias: 'INSUFFICIENT_DATA',
    triggerBias: 'INSUFFICIENT_DATA',
    alignmentScore: 0,
    conflicts: [],
  };
}

/** Empty liquidity-sweep result used by the data-health WAIT path. */
export function emptySweep(): FuturesLiquiditySweep {
  return { type: 'NONE', sweptLevel: null, confidence: 0 };
}
