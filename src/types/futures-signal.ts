/**
 * Futures Call Action V2 — strict types for the structured futures decision engine.
 *
 * V2 adds:
 *   - signalGrade        — A+ / A / B / C / D quality grade
 *   - entryTrigger       — classified entry mechanic
 *   - mtfConfirmation    — multi-timeframe alignment + conflicts
 *   - positioning        — funding rate + open interest interpretation
 *   - liquiditySweep     — bullish/bearish sweep detection
 *   - noTradeReasons     — ranked WAIT explanations
 *
 * The engine is still NOT a price-prediction system. Output is a setup with
 * explicit invalidation, risk, and confidence — never financial advice.
 */

import type { Candle } from '@/types/chart';
import type { RsiResult } from '@/lib/indicators/rsi';
import type { MacdPoint } from '@/lib/indicators/macd';
import type { SupportResistance } from '@/lib/indicators/support-resistance';

export type FuturesSignalAction = 'LONG' | 'SHORT' | 'WAIT';

export type FuturesMarketRegime =
  | 'BULLISH_TREND'
  | 'BEARISH_TREND'
  | 'RANGE'
  | 'CHOP_HIGH_RISK'
  | 'INSUFFICIENT_DATA';

export type FuturesRiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'NO_TRADE';

export type FuturesSignalGrade = 'A+' | 'A' | 'B' | 'C' | 'D';

/**
 * Phase 1 hardening — coarse letter grade exposed by the strict pipeline.
 * Maps the existing `signalGrade` (A+/A/B/C/D) onto the spec's A/B/C/D space.
 */
export type FuturesGrade = 'A' | 'B' | 'C' | 'D';

/**
 * Canonical, lowercase market-regime identifier exposed by the strict pipeline.
 * Distinct from `FuturesMarketRegime` (legacy, uppercase) so existing callers
 * keep working while new consumers can rely on the spec's vocabulary.
 */
export type FuturesMarketRegimeId =
  | 'bullish_trend'
  | 'bearish_trend'
  | 'range'
  | 'choppy'
  | 'volatile'
  | 'unknown';

/**
 * Trade permission derived from the 4H (macro) market regime.
 * The engine refuses any side that contradicts this permission.
 */
export type FuturesTradePermission =
  | 'long_only'
  | 'short_only'
  | 'both'
  | 'no_trade';

/**
 * Entry trigger lifecycle for the strict pipeline:
 *   - triggered:     a valid entry mechanic fired (breakout, retest, sweep, etc.)
 *   - not_triggered: bias may exist but no clean trigger present
 *   - invalid:       the engine could not even evaluate triggers (data health fail / unknown regime)
 */
export type FuturesEntryStatus = 'triggered' | 'not_triggered' | 'invalid';

/**
 * Risk approval status from the dedicated risk gate.
 *   - pass:           plan satisfies RR, ATR, leverage, overextension constraints
 *   - fail:           plan was rejected by the risk engine
 *   - not_applicable: pipeline did not reach the risk gate (earlier gate already failed)
 */
export type FuturesRiskApproval = 'pass' | 'fail' | 'not_applicable';

export type FuturesEntryTrigger =
  | 'BREAKOUT'
  | 'PULLBACK_RETEST'
  | 'LIQUIDITY_SWEEP_REVERSAL'
  | 'TREND_CONTINUATION'
  | 'RANGE_REVERSION'
  | 'NO_TRIGGER';

export type FuturesBias = 'BULLISH' | 'BEARISH' | 'NEUTRAL' | 'INSUFFICIENT_DATA';

export interface FuturesEntryZone {
  min: number | null;
  max: number | null;
}

export interface FuturesTakeProfits {
  tp1: number | null;
  tp2: number | null;
  tp3: number | null;
}

export interface FuturesSuggestedLeverage {
  min: number;
  max: number;
}

export interface FuturesSignalScoreBreakdown {
  trendScore: number;
  momentumScore: number;
  volumeScore: number;
  structureScore: number;
  riskScore: number;
  finalScore: number;
}

/**
 * Multi-timeframe alignment result.
 *
 * Macro (4H) → Setup (1H) → Trigger (15m) is the recommended cascade. Engines
 * may pass any compatible mapping. `alignmentScore` is 0..100 where higher is
 * better-aligned. `conflicts` is a list of plain-language conflict reasons.
 */
export interface FuturesMtfConfirmation {
  macroBias: FuturesBias;
  setupBias: FuturesBias;
  triggerBias: FuturesBias;
  alignmentScore: number;
  conflicts: string[];
}

export type FuturesFundingBias =
  | 'SUPPORTS_LONG'
  | 'SUPPORTS_SHORT'
  | 'CROWDED_LONG'
  | 'CROWDED_SHORT'
  | 'NEUTRAL'
  | 'UNAVAILABLE';

export type FuturesOpenInterestBias =
  | 'BULLISH_CONTINUATION'
  | 'BEARISH_CONTINUATION'
  | 'SHORT_COVERING'
  | 'LONG_LIQUIDATION'
  | 'NEUTRAL'
  | 'UNAVAILABLE';

export interface FuturesPositioning {
  fundingRate: number | null;
  fundingBias: FuturesFundingBias;
  openInterestChangePercent: number | null;
  openInterestBias: FuturesOpenInterestBias;
}

export type FuturesLiquiditySweepType = 'BULLISH_SWEEP' | 'BEARISH_SWEEP' | 'NONE';

export interface FuturesLiquiditySweep {
  type: FuturesLiquiditySweepType;
  sweptLevel: number | null;
  /** 0..100 confidence in the sweep classification. */
  confidence: number;
}

/**
 * Data health status for a single timeframe.
 *
 * `lastCandleAgeSec` is `null` when there are no candles to measure against.
 * `ok` is true only when count >= required AND age <= maxAgeSec.
 */
export interface FuturesTimeframeHealth {
  required: boolean;
  candleCount: number;
  minCandlesRequired: number;
  /** Seconds since the latest candle's close time. `null` when unknown. */
  lastCandleAgeSec: number | null;
  /** Maximum acceptable age before the timeframe is considered stale. */
  maxAgeSec: number;
  ok: boolean;
  reason: string | null;
}

/**
 * Result of the Data Health Gate.
 *
 * `ok` aggregates: symbol valid AND every required timeframe ok.
 * `confidenceCap` (0..100) is the maximum confidence the engine is allowed to
 * report once secondary data is missing/stale (e.g. funding or OI unavailable).
 */
export interface FuturesDataHealth {
  ok: boolean;
  symbol: { provided: boolean; valid: boolean; reason: string | null };
  setup: FuturesTimeframeHealth;
  macro: FuturesTimeframeHealth;
  trigger: FuturesTimeframeHealth;
  funding: { available: boolean; ageSec: number | null; maxAgeSec: number; ok: boolean };
  openInterest: { available: boolean; ageSec: number | null; maxAgeSec: number; ok: boolean };
  reasons: string[];
  confidenceCap: number;
}

export interface FuturesSignal {
  action: FuturesSignalAction;
  confidenceScore: number;
  signalGrade: FuturesSignalGrade;
  entryTrigger: FuturesEntryTrigger;
  regime: FuturesMarketRegime;
  entryZone: FuturesEntryZone;
  stopLoss: number | null;
  takeProfits: FuturesTakeProfits;
  riskRewardRatio: number | null;
  suggestedLeverage: FuturesSuggestedLeverage;
  riskLevel: FuturesRiskLevel;
  invalidationReason: string;
  summary: string;
  reasons: string[];
  warnings: string[];
  /**
   * Ranked reasons explaining a WAIT outcome. Empty when the action is LONG
   * or SHORT. The first item is the highest-severity reason.
   */
  noTradeReasons: string[];
  primaryNoTradeReason: string | null;
  mtfConfirmation: FuturesMtfConfirmation;
  positioning: FuturesPositioning;
  liquiditySweep: FuturesLiquiditySweep;
  scoreBreakdown: FuturesSignalScoreBreakdown;

  // ----- Phase 1 strict pipeline outputs (additive, never replace existing fields) -----

  /**
   * Mirror of `confidenceScore` exposed under the spec's name. Always in 0..100.
   * Capped by `dataHealth.confidenceCap` when secondary data is missing/stale.
   */
  confidence: number;

  /** Coarse A/B/C/D grade derived from `signalGrade` for the strict pipeline. */
  grade: FuturesGrade;

  /** Canonical lowercase market regime id (spec vocabulary). */
  marketRegime: FuturesMarketRegimeId;

  /** 4H-driven trade permission. The engine refuses any conflicting side. */
  tradePermission: FuturesTradePermission;

  /** Strict pre-flight data health snapshot. */
  dataHealth: FuturesDataHealth;

  /** Entry trigger lifecycle for the current bar. */
  entryStatus: FuturesEntryStatus;

  /** Authoritative risk-gate verdict. */
  riskApproval: FuturesRiskApproval;

  /**
   * Invalidation level (e.g. SL price) for actionable signals. `null` when WAIT
   * because no concrete level is committed.
   */
  invalidation: string | null;

  /** Spec alias for `reasons`. Same content; both kept for stability. */
  reason: string[];
}

/**
 * Engine input. Indicators that have already been computed upstream are
 * passed in to avoid duplicate calculation. Anything not provided will be
 * computed from candles when possible.
 */
export interface FuturesSignalInput {
  symbol: string;
  timeframe: string;
  candles: Candle[];
  /** Optional: latest live price; falls back to last candle close. */
  livePrice?: number;
  /** Pre-computed RSI status (parent already calculates this). */
  rsi?: RsiResult;
  /** Pre-computed latest MACD point. */
  macd?: MacdPoint | null;
  /** Pre-computed support/resistance. */
  supportResistance?: SupportResistance;
  /** Higher-timeframe candles (e.g. 4H) for macro bias. */
  macroCandles?: Candle[];
  /** Lower-timeframe candles (e.g. 15m) for trigger bias. */
  triggerCandles?: Candle[];
  /** Latest funding rate as a decimal (e.g. 0.0001 = 0.01%). */
  fundingRate?: number | null;
  /** % change in open interest over a recent window (e.g. last hour). */
  openInterestChangePercent?: number | null;
  /**
   * Reference "now" timestamp in milliseconds for freshness checks.
   * Defaults to `Date.now()`. Allows deterministic testing.
   */
  nowMs?: number;
  /** Timestamp (ms) of the latest funding-rate update. Optional. */
  fundingRateUpdatedAtMs?: number | null;
  /** Timestamp (ms) of the latest open-interest sample. Optional. */
  openInterestUpdatedAtMs?: number | null;
}

/**
 * Tunable thresholds. All defaults match the specification but can be
 * overridden for backtesting or per-symbol calibration.
 */
export interface FuturesSignalConfig {
  minRiskReward: number;
  atrStopMultiplier: number;
  scoreActionable: number;
  scoreValidWaitConfirm: number;
  scoreNeutral: number;
  adxTrendThreshold: number;
  adxWeakThreshold: number;
  extremeVolatilityRatio: number;
  overextensionRatio: number;
  emaShortPeriod: number;
  emaMidPeriod: number;
  emaLongPeriod: number;
  atrPeriod: number;
  adxPeriod: number;
  swingLookback: number;
  /** MTF alignment score below which the signal is downgraded/blocked. */
  mtfMinAlignmentScore: number;
  /** Funding rate threshold for "crowded" positioning detection. */
  fundingCrowdedThreshold: number;
  /**
   * Multiplier applied to inferred candle interval to set the staleness
   * threshold. Example: 30m candles with multiplier 2 → max age 60min.
   */
  freshnessMultiplier: number;
  /** Maximum age (s) for a funding-rate sample to be considered fresh. */
  fundingMaxAgeSec: number;
  /** Maximum age (s) for an open-interest sample to be considered fresh. */
  oiMaxAgeSec: number;
  /** Minimum candles required on the trigger TF (15m). */
  minTriggerCandles: number;
}

export const DEFAULT_FUTURES_SIGNAL_CONFIG: FuturesSignalConfig = {
  minRiskReward: 1.8,
  atrStopMultiplier: 1.5,
  scoreActionable: 75,
  scoreValidWaitConfirm: 60,
  scoreNeutral: 45,
  adxTrendThreshold: 22,
  adxWeakThreshold: 18,
  extremeVolatilityRatio: 0.05,
  overextensionRatio: 0.04,
  emaShortPeriod: 20,
  emaMidPeriod: 50,
  emaLongPeriod: 200,
  atrPeriod: 14,
  adxPeriod: 14,
  swingLookback: 20,
  mtfMinAlignmentScore: 60,
  fundingCrowdedThreshold: 0.0005,
  freshnessMultiplier: 2.5,
  fundingMaxAgeSec: 9 * 3600,
  oiMaxAgeSec: 15 * 60,
  minTriggerCandles: 50,
};
