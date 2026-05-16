import type { Candle } from '@/types/chart';

/**
 * Average True Range (ATR) — Wilder's smoothing.
 *
 * Volatility measure used by the regime detector and risk engine to size
 * stops, qualify "extreme" volatility, and detect overextension. Returns
 * `null` on insufficient data so callers never have to defensively check
 * for NaN.
 */

/**
 * True Range (TR) for a single candle relative to the previous close.
 *
 * TR = max(
 *   high - low,
 *   abs(high - previousClose),
 *   abs(low  - previousClose)
 * )
 */
export function calculateTrueRange(current: Candle, previousClose: number): number {
  const a = current.high - current.low;
  const b = Math.abs(current.high - previousClose);
  const c = Math.abs(current.low - previousClose);
  return Math.max(a, b, c);
}

/**
 * Full ATR series using Wilder's smoothing.
 * Returns `null` when there is not enough data to seed the first ATR.
 */
export function calculateATR(candles: Candle[], period = 14): number[] | null {
  if (!Number.isFinite(period) || period <= 0) return null;
  // We need `period` TR values to seed the initial ATR. Each TR consumes one
  // previous close, so the candle count requirement is `period + 1`.
  if (candles.length < period + 1) return null;

  const trs: number[] = [];
  for (let i = 1; i < candles.length; i++) {
    const prev = candles[i - 1];
    const cur = candles[i];
    if (!prev || !cur) return null;
    trs.push(calculateTrueRange(cur, prev.close));
  }

  if (trs.length < period) return null;

  // Seed: simple average of the first `period` TR values.
  let atr = 0;
  for (let i = 0; i < period; i++) atr += trs[i] ?? 0;
  atr /= period;

  const series: number[] = [atr];
  for (let i = period; i < trs.length; i++) {
    const tr = trs[i] ?? 0;
    atr = (atr * (period - 1) + tr) / period;
    series.push(atr);
  }

  return series;
}

/**
 * Latest ATR value, or `null` if insufficient data.
 */
export function calculateLatestATR(candles: Candle[], period = 14): number | null {
  const series = calculateATR(candles, period);
  if (!series || series.length === 0) return null;
  return series[series.length - 1] ?? null;
}
