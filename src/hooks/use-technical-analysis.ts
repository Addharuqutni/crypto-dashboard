'use client';

import { useMemo } from 'react';
import type { AnalysisResult, Candle } from '@/types/chart';
import {
  getRsiStatus,
  calculateMACD,
  calculateSupportResistance,
  calculateTrendLabel,
  calculateFibonacci,
  calculateOrderBlocks,
} from '@/lib/domain/indicators';

/**
 * Maximum number of candles fed into client-side technical indicator
 * calculations. Indicators only need the recent window for accurate
 * MA/RSI/MACD output, so bounding the input keeps the main thread fast
 * regardless of how much history Binance returns.
 */
const MAX_INDICATOR_CANDLES = 1000;

interface UseTechnicalAnalysisParams {
  candles: Candle[] | undefined;
  /** Computation is gated behind technical mode to keep clean mode cheap. */
  isTechnicalMode: boolean;
}

/**
 * Compute the technical-analysis bundle (RSI, MACD, S/R, trend, Fib, OBs)
 * for the active timeframe. Returns `null` when:
 *   - clean (non-technical) mode is active
 *   - candle history is too short to be meaningful
 *
 * Memoized on `candles` reference so refetches that produce a new array
 * (but the same content) still re-evaluate exactly once.
 */
export function useTechnicalAnalysis({
  candles,
  isTechnicalMode,
}: UseTechnicalAnalysisParams): AnalysisResult | null {
  return useMemo(() => {
    if (!isTechnicalMode) return null;
    if (!candles || candles.length < 14) return null;

    const window =
      candles.length > MAX_INDICATOR_CANDLES
        ? candles.slice(-MAX_INDICATOR_CANDLES)
        : candles;

    const rsi = getRsiStatus(window);
    const macd = calculateMACD(window);
    const sr = calculateSupportResistance(window);
    const trend = calculateTrendLabel(window);
    const fib = calculateFibonacci(window);
    const orderBlocks = calculateOrderBlocks(window);
    const latestMacd = macd.length > 0 ? macd[macd.length - 1]! : null;

    return { rsi, macd: latestMacd, sr, trend, fib, orderBlocks };
  }, [isTechnicalMode, candles]);
}
