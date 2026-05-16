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
};
