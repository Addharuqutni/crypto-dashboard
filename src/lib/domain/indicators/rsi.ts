import type { Candle } from '@/types/chart';

export type RsiResult = {
  value?: number;
  status: 'overbought' | 'oversold' | 'neutral' | 'insufficient_data';
  period: number;
};

export type RsiPoint = {
  time: number;
  value: number;
};

/**
 * Calculate RSI (Relative Strength Index) series.
 * Default period: 14.
 * RSI > 70: Overbought, RSI < 30: Oversold, 30-70: Neutral.
 */
export function calculateRSI(candles: Candle[], period = 14): RsiPoint[] {
  if (candles.length < period + 1) return [];

  const changes: number[] = [];
  for (let i = 1; i < candles.length; i++) {
    changes.push(candles[i]!.close - candles[i - 1]!.close);
  }

  const result: RsiPoint[] = [];

  // Initial average gain/loss
  let avgGain = 0;
  let avgLoss = 0;

  for (let i = 0; i < period; i++) {
    const change = changes[i]!;
    if (change > 0) avgGain += change;
    else avgLoss += Math.abs(change);
  }

  avgGain /= period;
  avgLoss /= period;

  // First RSI point
  const firstRsi = computeRsi(avgGain, avgLoss);
  result.push({ time: candles[period]!.openTime, value: firstRsi });

  // Subsequent points using smoothed averages
  for (let i = period; i < changes.length; i++) {
    const change = changes[i]!;
    const gain = change > 0 ? change : 0;
    const loss = change < 0 ? Math.abs(change) : 0;

    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;

    const rsi = computeRsi(avgGain, avgLoss);

    result.push({ time: candles[i + 1]!.openTime, value: rsi });
  }

  return result;
}

/**
 * Convert smoothed gain/loss averages into RSI.
 * Handles flat markets as neutral (50) and lossless uptrends as 100.
 */
function computeRsi(avgGain: number, avgLoss: number): number {
  if (avgLoss === 0 && avgGain === 0) return 50;
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

/**
 * Get current RSI status from the latest value.
 */
export function getRsiStatus(candles: Candle[], period = 14): RsiResult {
  const series = calculateRSI(candles, period);

  if (series.length === 0) {
    return { status: 'insufficient_data', period };
  }

  const latest = series[series.length - 1]!.value;

  let status: RsiResult['status'] = 'neutral';
  if (latest > 70) status = 'overbought';
  else if (latest < 30) status = 'oversold';

  return { value: latest, status, period };
}
