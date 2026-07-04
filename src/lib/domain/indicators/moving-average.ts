import type { Candle } from '@/types/chart';

/**
 * Calculate Simple Moving Average (SMA) for a given period.
 * Returns array of { time, value } points aligned with input data.
 */
export function calculateSMA(
  candles: Candle[],
  period: 7 | 25 | 99
): { time: number; value: number }[] {
  if (candles.length < period) return [];

  const result: { time: number; value: number }[] = [];

  for (let i = period - 1; i < candles.length; i++) {
    let sum = 0;
    for (let j = i - period + 1; j <= i; j++) {
      sum += candles[j]!.close;
    }
    result.push({
      time: candles[i]!.openTime,
      value: sum / period,
    });
  }

  return result;
}
