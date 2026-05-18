'use client';

import { useQuery } from '@tanstack/react-query';
import type { Candle, ChartTimeframe } from '@/types/chart';
import { fetchKlineData } from '@/lib/api/binance-kline';
import { fetchFundingRate } from '@/lib/api/binance-funding-rate';
import { fetchOpenInterestSnapshot } from '@/lib/api/binance-open-interest';
import { useBinanceKlineWebSocket } from '@/lib/websocket/use-binance-kline-websocket';
import { resolveBinanceSymbol } from '@/lib/registry/coin-registry';
import { MTF_CASCADE } from '@/lib/analysis/mtf-cascade';
import type { FundingRateSnapshot } from '@/lib/api/binance-funding-rate';
import type { OpenInterestSnapshot } from '@/lib/api/binance-open-interest';

interface UseCoinMarketDataParams {
  /** Resolved coin symbol (e.g. BTC). */
  symbol: string;
  /** Active chart timeframe. */
  timeframe: ChartTimeframe;
  /** Whether the coin route is valid; gates every query. */
  enabled: boolean;
  /** True when technical mode is on; gates expensive multi-TF + positioning calls. */
  isTechnicalMode: boolean;
}

interface UseCoinMarketDataResult {
  candles: Candle[] | undefined;
  chartLoading: boolean;
  chartError: boolean;
  macroCandles: Candle[] | undefined;
  triggerCandles: Candle[] | undefined;
  funding: FundingRateSnapshot | null | undefined;
  oiSnapshot: OpenInterestSnapshot | null | undefined;
}

/**
 * Centralized market-data wiring for the coin detail page.
 *
 * Responsibilities:
 *   - primary candle history for the active timeframe
 *   - live kline WebSocket subscription (patches the same query cache key
 *     in place so the chart updates without blinking)
 *   - macro/trigger TF candle history for the futures signal engine
 *   - funding rate + open interest snapshots for positioning context
 *
 * Query keys are kept identical to the original inline implementation so
 * cache continuity and in-place WS patching are preserved.
 */
export function useCoinMarketData({
  symbol,
  timeframe,
  enabled,
  isTechnicalMode,
}: UseCoinMarketDataParams): UseCoinMarketDataResult {
  const macroTf = MTF_CASCADE[timeframe]?.macro;
  const triggerTf = MTF_CASCADE[timeframe]?.trigger;
  const binanceSymbol = resolveBinanceSymbol(symbol);

  // --- Primary candles for the active timeframe. ---
  const {
    data: candles,
    isLoading: chartLoading,
    isError: chartError,
  } = useQuery({
    queryKey: ['candles-raw', symbol, timeframe],
    queryFn: () => fetchKlineData(symbol, timeframe),
    staleTime: 60 * 1000,
    refetchInterval: 60 * 1000,
    enabled,
  });

  // Subscribe to live kline ticks. The hook patches the same cache key in
  // place so the chart's effect detects only-last-bar mutation and uses
  // series.update() instead of a full redraw — no blink.
  useBinanceKlineWebSocket({
    symbol,
    timeframe,
    enabled,
  });

  // --- Multi-timeframe context (only in technical mode). ---
  const { data: macroCandles } = useQuery({
    queryKey: ['candles-raw', symbol, macroTf ?? 'none', 'macro'],
    queryFn: () => (macroTf ? fetchKlineData(symbol, macroTf) : Promise.resolve([])),
    staleTime: 5 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
    enabled: enabled && isTechnicalMode && !!macroTf,
  });

  const { data: triggerCandles } = useQuery({
    queryKey: ['candles-raw', symbol, triggerTf ?? 'none', 'trigger'],
    queryFn: () => (triggerTf ? fetchKlineData(symbol, triggerTf) : Promise.resolve([])),
    staleTime: 60 * 1000,
    refetchInterval: 60 * 1000,
    enabled: enabled && isTechnicalMode && !!triggerTf,
  });

  // --- Positioning: funding + open interest. ---
  const { data: funding } = useQuery({
    queryKey: ['funding-rate', binanceSymbol],
    queryFn: () => fetchFundingRate(binanceSymbol),
    staleTime: 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
    enabled: enabled && isTechnicalMode,
  });

  const { data: oiSnapshot } = useQuery({
    queryKey: ['open-interest', binanceSymbol],
    queryFn: () => fetchOpenInterestSnapshot(binanceSymbol, '1h'),
    staleTime: 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
    enabled: enabled && isTechnicalMode,
  });

  return {
    candles,
    chartLoading,
    chartError,
    macroCandles,
    triggerCandles,
    funding,
    oiSnapshot,
  };
}
