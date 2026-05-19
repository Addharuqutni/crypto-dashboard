import type { Candle } from '@/types/chart';

export type SupportResistance = {
  support?: number;
  resistance?: number;
  confidence: 'low' | 'medium' | 'high';
  reason: string;
};

/**
 * Calculate basic support and resistance levels from recent candle data.
 * Uses local highs/lows from the last N candles.
 */
export function calculateSupportResistance(
  candles: Candle[],
  lookback = 20
): SupportResistance {
  if (candles.length < 5) {
    return { confidence: 'low', reason: 'Insufficient data for support/resistance calculation.' };
  }

  const recent = candles.slice(-lookback);
  const highs = recent.map((c) => c.high);
  const lows = recent.map((c) => c.low);

  const resistance = Math.max(...highs);
  const support = Math.min(...lows);

  // Determine confidence based on how many times price touched these levels
  const range = resistance - support;

  let confidence: SupportResistance['confidence'] = 'medium';
  if (candles.length >= 30 && range > 0) {
    const touchThreshold = range * 0.02;
    const resistanceTouches = recent.filter((c) => Math.abs(c.high - resistance) < touchThreshold).length;
    const supportTouches = recent.filter((c) => Math.abs(c.low - support) < touchThreshold).length;

    if (resistanceTouches >= 3 || supportTouches >= 3) confidence = 'high';
    else if (resistanceTouches >= 2 || supportTouches >= 2) confidence = 'medium';
    else confidence = 'low';
  }

  return {
    support,
    resistance,
    confidence,
    reason: `Based on ${lookback}-period local highs and lows.`,
  };
}
