import type { Candle } from '@/types/chart';
import { calculateSMA } from './moving-average';
import { getRsiStatus } from './rsi';

export type TrendLabel = {
  value: 'bullish' | 'bearish' | 'sideways' | 'insufficient_data';
  reasons: string[];
};

/**
 * Determine trend label based on price vs MA and RSI.
 * Rules:
 * - Price above MA25 and MA99: bullish bias
 * - Price below MA25 and MA99: bearish bias
 * - Mixed signals: sideways/neutral
 */
export function calculateTrendLabel(candles: Candle[]): TrendLabel {
  if (candles.length < 25) {
    return { value: 'insufficient_data', reasons: ['Not enough data for trend analysis.'] };
  }

  const currentPrice = candles[candles.length - 1]!.close;
  const ma25 = calculateSMA(candles, 25);
  const reasons: string[] = [];

  if (ma25.length === 0) {
    return { value: 'insufficient_data', reasons: ['Not enough data for MA25.'] };
  }

  const latestMa25 = ma25[ma25.length - 1]!.value;
  const aboveMa25 = currentPrice > latestMa25;

  // Check MA99 if enough data
  let aboveMa99: boolean | null = null;
  if (candles.length >= 99) {
    const ma99 = calculateSMA(candles, 99);
    if (ma99.length > 0) {
      const latestMa99 = ma99[ma99.length - 1]!.value;
      aboveMa99 = currentPrice > latestMa99;
    }
  }

  // RSI check
  const rsi = getRsiStatus(candles);

  // Determine trend
  if (aboveMa25 && (aboveMa99 === null || aboveMa99)) {
    reasons.push('Price is above MA25');
    if (aboveMa99) reasons.push('Price is above MA99');
    if (rsi.value && rsi.value > 50) reasons.push(`RSI at ${rsi.value.toFixed(0)} shows positive momentum`);
    return { value: 'bullish', reasons };
  }

  if (!aboveMa25 && (aboveMa99 === null || !aboveMa99)) {
    reasons.push('Price is below MA25');
    if (aboveMa99 === false) reasons.push('Price is below MA99');
    if (rsi.value && rsi.value < 50) reasons.push(`RSI at ${rsi.value.toFixed(0)} shows negative momentum`);
    return { value: 'bearish', reasons };
  }

  reasons.push('Mixed signals between MA25 and MA99');
  if (rsi.value) reasons.push(`RSI is neutral at ${rsi.value.toFixed(0)}`);
  return { value: 'sideways', reasons };
}
