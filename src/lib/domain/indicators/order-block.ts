import type { Candle } from '@/types/chart';

export type OrderBlock = {
  type: 'bullish' | 'bearish';
  high: number;
  low: number;
  openTime: number;
  closeTime: number;
  strength: 'strong' | 'moderate' | 'weak';
  tested: boolean;
};

/**
 * Detect Order Blocks from candle data.
 * 
 * Bullish Order Block: Last bearish candle before a strong bullish move.
 * Bearish Order Block: Last bullish candle before a strong bearish move.
 * 
 * Detection logic:
 * 1. Find "impulse" moves (candles with body > 2x average body size)
 * 2. The candle before an impulse move in the opposite direction is the Order Block
 * 3. Classify strength based on impulse magnitude
 * 4. Mark as "tested" if price has returned to the OB zone
 */
export function calculateOrderBlocks(candles: Candle[], maxBlocks = 5): OrderBlock[] {
  if (candles.length < 10) return [];

  const blocks: OrderBlock[] = [];

  // Calculate average body size for threshold
  const bodies = candles.map((c) => Math.abs(c.close - c.open));
  const avgBody = bodies.reduce((sum, b) => sum + b, 0) / bodies.length;
  const impulseThreshold = avgBody * 2;

  const currentPrice = candles[candles.length - 1]!.close;

  for (let i = 2; i < candles.length - 1; i++) {
    const current = candles[i]!;
    const prev = candles[i - 1]!;
    const currentBody = Math.abs(current.close - current.open);
    const isBullishImpulse = current.close > current.open && currentBody > impulseThreshold;
    const isBearishImpulse = current.close < current.open && currentBody > impulseThreshold;

    // Bullish OB: bearish candle before bullish impulse
    if (isBullishImpulse && prev.close < prev.open) {
      const strength = getStrength(currentBody, avgBody);
      const tested = currentPrice <= prev.high && currentPrice >= prev.low;

      blocks.push({
        type: 'bullish',
        high: prev.high,
        low: prev.low,
        openTime: prev.openTime,
        closeTime: prev.closeTime,
        strength,
        tested,
      });
    }

    // Bearish OB: bullish candle before bearish impulse
    if (isBearishImpulse && prev.close > prev.open) {
      const strength = getStrength(currentBody, avgBody);
      const tested = currentPrice <= prev.high && currentPrice >= prev.low;

      blocks.push({
        type: 'bearish',
        high: prev.high,
        low: prev.low,
        openTime: prev.openTime,
        closeTime: prev.closeTime,
        strength,
        tested,
      });
    }
  }

  // Return most recent blocks, limited to maxBlocks
  return blocks.slice(-maxBlocks);
}

/**
 * Classify OB strength based on impulse magnitude relative to average.
 */
function getStrength(impulseBody: number, avgBody: number): OrderBlock['strength'] {
  if (impulseBody > avgBody * 4) return 'strong';
  if (impulseBody > avgBody * 2.5) return 'moderate';
  return 'weak';
}
