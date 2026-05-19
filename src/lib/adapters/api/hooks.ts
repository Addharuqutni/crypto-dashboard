'use client';

import { useQuery } from '@tanstack/react-query';
import { fetchCoinMarketData, fetchCoinMetadata } from '@/lib/adapters/api/coingecko';
import { fetchKlineData } from '@/lib/adapters/api/binance-kline';
import { toLineData } from '@/lib/domain/chart/transform';
import type { ChartTimeframe } from '@/types/chart';

/**
 * Hook to fetch market data for all default coins from CoinGecko.
 * Refreshes every 2 minutes to stay within rate limits.
 */
export function useMarketData() {
  return useQuery({
    queryKey: ['market-data'],
    queryFn: fetchCoinMarketData,
    staleTime: 2 * 60 * 1000,
    refetchInterval: 2 * 60 * 1000,
  });
}

/**
 * Hook to fetch metadata for a single coin.
 */
export function useCoinMetadata(coingeckoId: string | undefined) {
  return useQuery({
    queryKey: ['coin-metadata', coingeckoId],
    queryFn: () => fetchCoinMetadata(coingeckoId!),
    enabled: !!coingeckoId,
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Hook to fetch chart data (klines) for a coin and timeframe.
 * Returns chart-ready line points (Lightweight Charts native format).
 */
export function useChartData(symbol: string, timeframe: ChartTimeframe) {
  return useQuery({
    queryKey: ['chart-data', symbol, timeframe],
    /**
     * Menjalankan logic query fn.
     * Dipakai untuk memisahkan tanggung jawab fungsi ini dari bagian aplikasi lain.
     */
    queryFn: async () => {
      const candles = await fetchKlineData(symbol, timeframe);
      // Convert raw Binance candles into Lightweight Charts line points.
      // toLineData expects ms timestamps and converts to UTCTimestamp seconds.
      return toLineData(candles.map((c) => ({ time: c.openTime, value: c.close })));
    },
    staleTime: 60 * 1000,
    refetchInterval: 60 * 1000,
  });
}
