import type { Candle } from '@/types/chart';

/**
 * Exponential Moving Average (EMA).
 *
 * Pure numeric utilities with no React/DOM dependency. Used by the futures
 * signal engine, regime detector, and any other analysis module that needs
 * trend-following smoothing.
 *
 * The series is seeded with the simple average of the first `period` values
 * (Wilder/standard convention) and then advances using the standard
 * multiplier `2 / (period + 1)`. Insufficient data returns `null` so callers
 * can branch instead of dealing with `NaN`.
 */

/**
 * Calculate the full EMA series for a numeric array.
 *
 * @returns array aligned to the tail of the input (length = values.length - period + 1),
 *          or `null` when input is too short / period is invalid.
 */
export function calculateEMA(values: number[], period: number): number[] | null {
  if (!Number.isFinite(period) || period <= 0) return null;
  if (values.length < period) return null;

  const multiplier = 2 / (period + 1);
  const result: number[] = [];

  // Seed: SMA of the first `period` values.
  let seed = 0;
  for (let i = 0; i < period; i++) {
    const v = values[i];
    if (typeof v !== 'number' || !Number.isFinite(v)) return null;
    seed += v;
  }
  let prev = seed / period;
  result.push(prev);

  for (let i = period; i < values.length; i++) {
    const v = values[i];
    if (typeof v !== 'number' || !Number.isFinite(v)) return null;
    const next = (v - prev) * multiplier + prev;
    result.push(next);
    prev = next;
  }

  return result;
}

/**
 * Convenience: latest EMA value, or `null` when insufficient data.
 */
export function calculateLatestEMA(values: number[], period: number): number | null {
  const series = calculateEMA(values, period);
  if (!series || series.length === 0) return null;
  return series[series.length - 1] ?? null;
}

/**
 * Calculate EMA from candle close prices.
 */
export function calculateEMAFromCandles(candles: Candle[], period: number): number[] | null {
  if (candles.length === 0) return null;
  return calculateEMA(
    candles.map((c) => c.close),
    period
  );
}

/**
 * Latest EMA value from candle close prices, or `null` when insufficient.
 */
export function calculateLatestEMAFromCandles(
  candles: Candle[],
  period: number
): number | null {
  if (candles.length === 0) return null;
  return calculateLatestEMA(
    candles.map((c) => c.close),
    period
  );
}
