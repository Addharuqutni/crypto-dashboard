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

/**
 * Calculate all three MA lines (7, 25, 99) at once.
 */
export function calculateAllMAs(candles: Candle[]): {
  ma7: { time: number; value: number }[];
  ma25: { time: number; value: number }[];
  ma99: { time: number; value: number }[];
} {
  return {
    ma7: calculateSMA(candles, 7),
    ma25: calculateSMA(candles, 25),
    ma99: calculateSMA(candles, 99),
  };
}
