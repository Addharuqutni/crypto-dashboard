import type { Candle } from '@/types/chart';
import { calculateTrueRange } from './atr';

/**
 * Average Directional Index (ADX) with +DI / -DI — Wilder's method.
 *
 * Trend strength is the cornerstone of regime detection: strong ADX
 * (>= 20-25) implies a trending market, weak ADX implies range/chop.
 *
 * Returns `null` for insufficient data so callers branch explicitly
 * instead of handling NaN.
 */

export type AdxResult = {
  adx: number;
  plusDi: number;
  minusDi: number;
};

export type AdxPoint = AdxResult & { time: number };

/**
 * Compute the full ADX series with +DI / -DI.
 *
 * Wilder's classic implementation:
 *   1. For each candle pair, derive +DM, -DM, TR.
 *   2. Apply Wilder smoothing over `period` to +DM, -DM, TR.
 *   3. +DI = 100 * smoothed(+DM) / smoothed(TR).
 *   4. -DI = 100 * smoothed(-DM) / smoothed(TR).
 *   5. DX  = 100 * |+DI - -DI| / (+DI + -DI).
 *   6. ADX = Wilder smoothing of DX over `period`.
 *
 * Requires at least `2 * period + 1` candles to produce a single ADX point.
 */
export function calculateADX(candles: Candle[], period = 14): AdxPoint[] | null {
  if (!Number.isFinite(period) || period <= 0) return null;
  if (candles.length < 2 * period + 1) return null;

  // Step 1: per-bar TR, +DM, -DM.
  const trs: number[] = [];
  const plusDms: number[] = [];
  const minusDms: number[] = [];

  for (let i = 1; i < candles.length; i++) {
    const prev = candles[i - 1];
    const cur = candles[i];
    if (!prev || !cur) return null;

    const upMove = cur.high - prev.high;
    const downMove = prev.low - cur.low;

    const plusDm = upMove > downMove && upMove > 0 ? upMove : 0;
    const minusDm = downMove > upMove && downMove > 0 ? downMove : 0;

    trs.push(calculateTrueRange(cur, prev.close));
    plusDms.push(plusDm);
    minusDms.push(minusDm);
  }

  if (trs.length < period) return null;

  // Step 2: Wilder smoothing seed = sum (not average) of first `period` values.
  let trSmooth = 0;
  let plusDmSmooth = 0;
  let minusDmSmooth = 0;
  for (let i = 0; i < period; i++) {
    trSmooth += trs[i] ?? 0;
    plusDmSmooth += plusDms[i] ?? 0;
    minusDmSmooth += minusDms[i] ?? 0;
  }

  const dxSeries: number[] = [];
  // Track index in the candles array for time alignment of each DX point.
  const candleIndices: number[] = [];

  // First DX is computed using the seeded smoothed values.
  let dx = computeDx(plusDmSmooth, minusDmSmooth, trSmooth);
  dxSeries.push(dx);
  candleIndices.push(period); // candle at index `period` corresponds to TR index period-1

  for (let i = period; i < trs.length; i++) {
    // Wilder smoothing forward step.
    trSmooth = trSmooth - trSmooth / period + (trs[i] ?? 0);
    plusDmSmooth = plusDmSmooth - plusDmSmooth / period + (plusDms[i] ?? 0);
    minusDmSmooth = minusDmSmooth - minusDmSmooth / period + (minusDms[i] ?? 0);

    dx = computeDx(plusDmSmooth, minusDmSmooth, trSmooth);
    dxSeries.push(dx);
    // TR at index i corresponds to candle i+1 in the original array.
    candleIndices.push(i + 1);
  }

  // Step 6: ADX = Wilder smoothed DX over `period` of the DX series.
  if (dxSeries.length < period) return null;

  let adx = 0;
  for (let i = 0; i < period; i++) adx += dxSeries[i] ?? 0;
  adx /= period;

  const result: AdxPoint[] = [];

  // Recompute final +DI / -DI for output points using the same forward
  // smoothing path. We replay smoothing alongside ADX to keep them aligned.
  let trS2 = 0;
  let plusS2 = 0;
  let minusS2 = 0;
  for (let i = 0; i < period; i++) {
    trS2 += trs[i] ?? 0;
    plusS2 += plusDms[i] ?? 0;
    minusS2 += minusDms[i] ?? 0;
  }

  // Walk DX series and produce ADX points, starting from index `period - 1`
  // (the first ADX value sits `period` DX values in).
  // For each DX index k, candle index is candleIndices[k].
  // Smoothed DM/TR for the corresponding bar must be advanced in lockstep.
  // dxSeries[0] uses the seeded smoothed DM/TR computed above.
  // We re-walk to keep DI values aligned to the same forward path as ADX.

  // Store +DI / -DI per DX point.
  const plusDiSeries: number[] = [];
  const minusDiSeries: number[] = [];

  plusDiSeries.push(diValue(plusS2, trS2));
  minusDiSeries.push(diValue(minusS2, trS2));

  for (let i = period; i < trs.length; i++) {
    trS2 = trS2 - trS2 / period + (trs[i] ?? 0);
    plusS2 = plusS2 - plusS2 / period + (plusDms[i] ?? 0);
    minusS2 = minusS2 - minusS2 / period + (minusDms[i] ?? 0);
    plusDiSeries.push(diValue(plusS2, trS2));
    minusDiSeries.push(diValue(minusS2, trS2));
  }

  // First ADX value at DX index `period - 1`.
  const firstAdxDxIndex = period - 1;
  const firstCandleIndex = candleIndices[firstAdxDxIndex];
  if (firstCandleIndex == null) return null;

  result.push({
    time: candles[firstCandleIndex]?.openTime ?? 0,
    adx,
    plusDi: plusDiSeries[firstAdxDxIndex] ?? 0,
    minusDi: minusDiSeries[firstAdxDxIndex] ?? 0,
  });

  for (let k = period; k < dxSeries.length; k++) {
    adx = (adx * (period - 1) + (dxSeries[k] ?? 0)) / period;
    const ci = candleIndices[k];
    if (ci == null) continue;
    result.push({
      time: candles[ci]?.openTime ?? 0,
      adx,
      plusDi: plusDiSeries[k] ?? 0,
      minusDi: minusDiSeries[k] ?? 0,
    });
  }

  return result;
}

/**
 * Latest ADX result, or `null` if insufficient data.
 */
export function calculateLatestADX(candles: Candle[], period = 14): AdxResult | null {
  const series = calculateADX(candles, period);
  if (!series || series.length === 0) return null;
  const last = series[series.length - 1];
  if (!last) return null;
  return { adx: last.adx, plusDi: last.plusDi, minusDi: last.minusDi };
}

/** DX = 100 * |+DI - -DI| / (+DI + -DI) — guarded against zero division. */
function computeDx(plusDmSmooth: number, minusDmSmooth: number, trSmooth: number): number {
  if (trSmooth <= 0) return 0;
  const plusDi = 100 * (plusDmSmooth / trSmooth);
  const minusDi = 100 * (minusDmSmooth / trSmooth);
  const sum = plusDi + minusDi;
  if (sum <= 0) return 0;
  return 100 * (Math.abs(plusDi - minusDi) / sum);
}

/** Helper for computing DI value safely. */
function diValue(dmSmooth: number, trSmooth: number): number {
  if (trSmooth <= 0) return 0;
  return 100 * (dmSmooth / trSmooth);
}
