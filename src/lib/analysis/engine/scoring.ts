import type { Candle } from '@/types/chart';
import type { FuturesSignalInput } from '@/types/futures-signal';
import { getRsiStatus } from '@/lib/indicators/rsi';
import { calculateMACD } from '@/lib/indicators/macd';
import { calculateSupportResistance } from '@/lib/indicators/support-resistance';
import type { RegimeContext } from '../regime-detector';
import { clamp } from './utils';

/**
 * Sub-score weighting applied to produce the final 0..100 score.
 *
 * Centralised so calibration changes are made in exactly one place. Weights
 * sum to 1.0; do not edit during a refactor phase.
 */
export const SCORE_WEIGHTS = {
  trend: 0.35,
  momentum: 0.25,
  volume: 0.15,
  structure: 0.15,
  risk: 0.1,
} as const;

/**
 * Per-side sub-score breakdown used by the pipeline before weighting.
 *
 * Each component is independently in `0..100`. They are intentionally
 * uncorrelated so a regime change affects them in distinct ways.
 */
export interface SubScores {
  trendScore: number;
  momentumScore: number;
  volumeScore: number;
  structureScore: number;
  riskScore: number;
}

/**
 * Compute every sub-score for a candidate side.
 *
 * Pure: given the same inputs the result is identical. Indicator calculations
 * that already happened upstream (RSI, MACD, S/R) are reused via `input` to
 * avoid recomputation.
 */
export function computeSubScores(
  side: 'LONG' | 'SHORT',
  candles: Candle[],
  price: number,
  regime: RegimeContext,
  input: FuturesSignalInput
): SubScores {
  return {
    trendScore: computeTrendScore(side, regime, price),
    momentumScore: computeMomentumScore(side, candles, input),
    volumeScore: computeVolumeScore(candles),
    structureScore: computeStructureScore(side, candles, price, input),
    riskScore: computeRiskScore(regime),
  };
}

/**
 * Combine a side's sub-scores with `SCORE_WEIGHTS` into a final 0..100 score.
 */
export function weightedScore(s: SubScores): number {
  const v =
    s.trendScore * SCORE_WEIGHTS.trend +
    s.momentumScore * SCORE_WEIGHTS.momentum +
    s.volumeScore * SCORE_WEIGHTS.volume +
    s.structureScore * SCORE_WEIGHTS.structure +
    s.riskScore * SCORE_WEIGHTS.risk;
  return clamp(v, 0, 100);
}

/**
 * Average volume over the prior 20 candles (excluding the most recent bar).
 *
 * Returns `null` when no prior bars exist or aggregate volume is zero so the
 * caller can branch instead of using a misleading 0.
 */
export function computeAvgVolume(candles: Candle[]): number | null {
  const sample = candles.slice(-21).slice(0, -1);
  if (sample.length === 0) return null;
  const sum = sample.reduce((s, c) => s + c.volume, 0);
  return sum > 0 ? sum / sample.length : null;
}

// ---------------------------------------------------------------------------
// Sub-score computations (private to this module).
// ---------------------------------------------------------------------------

/**
 * Trend score: how strongly the EMA stack and detected regime agree with the
 * candidate side. Anchored at 50 (neutral) and adjusted in fixed increments
 * so the contribution of each sub-rule is auditable.
 */
function computeTrendScore(
  side: 'LONG' | 'SHORT',
  regime: RegimeContext,
  price: number
): number {
  const { ema20, ema50, ema200 } = regime;
  if (ema20 == null || ema50 == null || ema200 == null) return 0;

  let score = 50;

  if (side === 'LONG') {
    if (price > ema200) score += 20;
    else score -= 20;
    if (ema20 > ema50) score += 15;
    else score -= 15;
    if (ema50 > ema200) score += 10;
    else score -= 10;
    if (regime.regime === 'BULLISH_TREND') score += 10;
    if (regime.regime === 'BEARISH_TREND') score -= 15;
  } else {
    if (price < ema200) score += 20;
    else score -= 20;
    if (ema20 < ema50) score += 15;
    else score -= 15;
    if (ema50 < ema200) score += 10;
    else score -= 10;
    if (regime.regime === 'BEARISH_TREND') score += 10;
    if (regime.regime === 'BULLISH_TREND') score -= 15;
  }

  return clamp(score, 0, 100);
}

/**
 * Momentum score from RSI + MACD. Falls back to neutral 50 when the indicator
 * payload is missing so the engine never silently rewards data gaps.
 */
function computeMomentumScore(
  side: 'LONG' | 'SHORT',
  candles: Candle[],
  input: FuturesSignalInput
): number {
  const rsi = input.rsi ?? getRsiStatus(candles);
  const macdSeries = input.macd !== undefined ? null : calculateMACD(candles);
  const macd =
    input.macd !== undefined
      ? input.macd
      : macdSeries && macdSeries.length > 0
        ? macdSeries[macdSeries.length - 1]
        : null;

  let score = 50;

  if (rsi.value != null) {
    if (side === 'LONG') {
      if (rsi.value > 50) score += 15;
      else score -= 15;
      if (rsi.value > 75) score -= 10;
      if (rsi.value < 30) score -= 5;
    } else {
      if (rsi.value < 50) score += 15;
      else score -= 15;
      if (rsi.value < 25) score -= 10;
      if (rsi.value > 70) score -= 5;
    }
  }

  if (macd) {
    if (side === 'LONG') {
      if (macd.histogram > 0) score += 20;
      else score -= 15;
      if (macd.macd > macd.signal) score += 10;
    } else {
      if (macd.histogram < 0) score += 20;
      else score -= 15;
      if (macd.macd < macd.signal) score += 10;
    }
  }

  return clamp(score, 0, 100);
}

/**
 * Volume score derived from the most recent bar relative to the prior 20.
 * Returns 50 (neutral) when there isn't enough sample to make a claim.
 */
function computeVolumeScore(candles: Candle[]): number {
  const sample = candles.slice(-21);
  if (sample.length < 5) return 50;

  const last = sample[sample.length - 1];
  if (!last || last.volume <= 0) return 50;

  const prior = sample.slice(0, -1);
  if (prior.length === 0) return 50;

  const avg = prior.reduce((s, c) => s + c.volume, 0) / prior.length;
  if (avg <= 0) return 50;

  const ratio = last.volume / avg;
  if (ratio >= 2) return 95;
  if (ratio >= 1.5) return 80;
  if (ratio >= 1.2) return 70;
  if (ratio >= 0.9) return 55;
  if (ratio >= 0.6) return 40;
  return 25;
}

/**
 * Structure score: position within the most recent support/resistance band.
 * Long candidates are rewarded near support, short candidates near resistance.
 */
function computeStructureScore(
  side: 'LONG' | 'SHORT',
  candles: Candle[],
  price: number,
  input: FuturesSignalInput
): number {
  const sr = input.supportResistance ?? calculateSupportResistance(candles);
  if (sr.support == null || sr.resistance == null) return 50;

  const range = sr.resistance - sr.support;
  if (range <= 0) return 50;

  const position = clamp((price - sr.support) / range, 0, 1);

  let score = 50;
  if (side === 'LONG') {
    if (position < 0.3) score += 25;
    else if (position < 0.5) score += 10;
    else if (position > 0.85) score -= 20;
  } else {
    if (position > 0.7) score += 25;
    else if (position > 0.5) score += 10;
    else if (position < 0.15) score -= 20;
  }

  if (sr.confidence === 'high') score += 10;
  else if (sr.confidence === 'low') score -= 5;

  return clamp(score, 0, 100);
}

/**
 * Risk score from realised volatility (ATR/price). Lower vol scores higher;
 * chop and range regimes apply additional penalties because they tend to
 * produce noisy stops regardless of headline ATR.
 */
function computeRiskScore(regime: RegimeContext): number {
  if (regime.atrPctOfPrice == null) return 40;

  const v = regime.atrPctOfPrice;
  let score = 50;
  if (v < 0.01) score = 85;
  else if (v < 0.02) score = 70;
  else if (v < 0.03) score = 55;
  else if (v < 0.04) score = 40;
  else score = 20;

  if (regime.regime === 'CHOP_HIGH_RISK') score -= 25;
  if (regime.regime === 'RANGE') score -= 10;

  return clamp(score, 0, 100);
}
