'use client';

import { useQuery } from '@tanstack/react-query';
import { fetchCoinMarketData, fetchCoinMetadata } from '@/lib/adapters/api/coingecko';

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
