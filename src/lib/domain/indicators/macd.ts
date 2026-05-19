import type { Candle } from '@/types/chart';

export type MacdPoint = {
  time: number;
  macd: number;
  signal: number;
  histogram: number;
};

/**
 * Calculate MACD (Moving Average Convergence Divergence).
 * Default: fast=12, slow=26, signal=9.
 * Returns MACD line, signal line, and histogram.
 */
export function calculateMACD(
  candles: Candle[],
  fastPeriod = 12,
  slowPeriod = 26,
  signalPeriod = 9
): MacdPoint[] {
  if (candles.length < slowPeriod + signalPeriod) return [];

  const closes = candles.map((c) => c.close);

  // Calculate EMAs
  const fastEma = calculateEMA(closes, fastPeriod);
  const slowEma = calculateEMA(closes, slowPeriod);

  // MACD line = fast EMA - slow EMA (aligned to slow EMA start)
  const macdLine: number[] = [];
  const offset = slowPeriod - fastPeriod;

  for (let i = 0; i < slowEma.length; i++) {
    macdLine.push(fastEma[i + offset]! - slowEma[i]!);
  }

  // Signal line = EMA of MACD line
  const signalLine = calculateEMA(macdLine, signalPeriod);

  // Build result points
  const result: MacdPoint[] = [];
  const signalOffset = macdLine.length - signalLine.length;
  const candleOffset = candles.length - signalLine.length;

  for (let i = 0; i < signalLine.length; i++) {
    const macdVal = macdLine[i + signalOffset]!;
    const signalVal = signalLine[i]!;

    result.push({
      time: candles[i + candleOffset]!.openTime,
      macd: macdVal,
      signal: signalVal,
      histogram: macdVal - signalVal,
    });
  }

  return result;
}

/**
 * Calculate Exponential Moving Average.
 */
function calculateEMA(data: number[], period: number): number[] {
  if (data.length < period) return [];

  const multiplier = 2 / (period + 1);
  const result: number[] = [];

  // First EMA = SMA of first `period` values
  let sum = 0;
  for (let i = 0; i < period; i++) {
    sum += data[i]!;
  }
  result.push(sum / period);

  // Subsequent EMAs
  for (let i = period; i < data.length; i++) {
    const ema = (data[i]! - result[result.length - 1]!) * multiplier + result[result.length - 1]!;
    result.push(ema);
  }

  return result;
}
