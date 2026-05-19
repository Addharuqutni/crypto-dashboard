'use client';

import { useMemo } from 'react';
import type { AnalysisResult, Candle, ChartTimeframe } from '@/types/chart';
import type { FuturesSignal } from '@/types/futures-signal';
import { generateFuturesSignal } from '@/lib/domain/analysis/futures-signal-engine';

interface UseFuturesSignalParams {
  symbol: string;
  timeframe: ChartTimeframe;
  candles: Candle[] | undefined;
  livePrice: number | undefined;
  analysis: AnalysisResult | null;
  macroCandles: Candle[] | undefined;
  triggerCandles: Candle[] | undefined;
  fundingRate: number | null | undefined;
  openInterestChangePercent: number | null | undefined;
  /** Only compute in technical mode (mirrors the previous inline behavior). */
  isTechnicalMode: boolean;
}

/**
 * Run the deterministic futures signal engine for the active coin/timeframe.
 *
 * The same signal feeds the Futures Setup panel and the AI summary so the AI
 * narrates the exact decision the user sees. Returns `null` when in clean
 * mode or when there are no candles to evaluate.
 */
export function useFuturesSignal({
  symbol,
  timeframe,
  candles,
  livePrice,
  analysis,
  macroCandles,
  triggerCandles,
  fundingRate,
  openInterestChangePercent,
  isTechnicalMode,
}: UseFuturesSignalParams): FuturesSignal | null {
  return useMemo(() => {
    if (!isTechnicalMode) return null;
    if (!candles || candles.length === 0) return null;
    return generateFuturesSignal({
      symbol,
      timeframe,
      candles,
      ...(livePrice != null ? { livePrice } : {}),
      ...(analysis?.rsi ? { rsi: analysis.rsi } : {}),
      ...(analysis?.macd ? { macd: analysis.macd } : {}),
      ...(analysis?.sr ? { supportResistance: analysis.sr } : {}),
      ...(macroCandles && macroCandles.length > 0 ? { macroCandles } : {}),
      ...(triggerCandles && triggerCandles.length > 0 ? { triggerCandles } : {}),
      fundingRate: fundingRate ?? null,
      openInterestChangePercent: openInterestChangePercent ?? null,
    });
  }, [
    isTechnicalMode,
    candles,
    symbol,
    timeframe,
    livePrice,
    analysis,
    macroCandles,
    triggerCandles,
    fundingRate,
    openInterestChangePercent,
  ]);
}
