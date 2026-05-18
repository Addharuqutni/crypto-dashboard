'use client';

import type { Candle } from '@/types/chart';

interface UseCoinHeaderStateParams {
  candles: Candle[] | undefined;
  /** Live price coming from the global market store (24h ticker fallback). */
  marketStorePrice: number | null | undefined;
  /** 24h percentage change from the global market store. */
  marketStoreChange: number | null | undefined;
}

interface UseCoinHeaderStateResult {
  /** Latest price preferring the kline-derived close, falling back to ticker. */
  price: number | null | undefined;
  /** 24h percentage change (mirrors the underlying ticker). */
  change: number | null | undefined;
  isUp: boolean;
  isDown: boolean;
}

/**
 * Derive the coin header's display state from the two complementary live
 * sources. The kline stream patches the candles cache every ~250ms, so the
 * latest candle's close is the freshest possible price for the active
 * timeframe. The global market-store fallback covers the warm-up window.
 */
export function useCoinHeaderState({
  candles,
  marketStorePrice,
  marketStoreChange,
}: UseCoinHeaderStateParams): UseCoinHeaderStateResult {
  const klineLivePrice =
    candles && candles.length > 0 ? candles[candles.length - 1]!.close : null;
  const price = klineLivePrice ?? marketStorePrice;
  const change = marketStoreChange;
  const isUp = (change ?? 0) > 0;
  const isDown = (change ?? 0) < 0;
  return { price, change, isUp, isDown };
}
