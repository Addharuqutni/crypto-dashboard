'use client';

import { useQuery } from '@tanstack/react-query';
import type { Candle, ChartTimeframe } from '@/types/chart';
import { fetchKlineData } from '@/lib/adapters/binance/binance-kline';
import { useBinanceKlineWebSocket } from '@/hooks/use-binance-kline-websocket';

interface UseCoinMarketDataParams {
  /** Resolved coin symbol (e.g. BTC). */
  symbol: string;
  /** Active chart timeframe. */
  timeframe: ChartTimeframe;
  /** Whether the coin route is valid; gates every query. */
  enabled: boolean;
  /** True when technical mode is on. */
  isTechnicalMode: boolean;
}

interface UseCoinMarketDataResult {
  candles: Candle[] | undefined;
  chartLoading: boolean;
  chartError: boolean;
}

/**
 * Market-data wiring for the coin detail page.
 *
 * Primary candle history + live kline WebSocket. Multi-timeframe signal
 * evaluation is owned by the Python Action Call agent, so macro/trigger/funding
 * fetches are no longer needed on the client.
 */
export function useCoinMarketData({
  symbol,
  timeframe,
  enabled,
}: UseCoinMarketDataParams): UseCoinMarketDataResult {
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

  useBinanceKlineWebSocket({
    symbol,
    timeframe,
    enabled,
  });

  return {
    candles,
    chartLoading,
    chartError,
  };
}
