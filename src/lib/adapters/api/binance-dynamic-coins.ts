/**
 * Fetches all available USDT trading pairs from Binance Exchange Info API.
 * Used to discover coins beyond the hardcoded registry.
 * Results are cached in memory to avoid repeated API calls.
 */

import type { CoinRegistryItem } from '@/types/coin';
import { getCoinByBinanceSymbol } from '@/lib/shared/registry/coin-registry';

interface BinanceSymbolInfo {
  symbol: string;
  baseAsset: string;
  quoteAsset: string;
  status: string;
}

interface BinanceExchangeInfo {
  symbols: BinanceSymbolInfo[];
}

let cachedDynamicCoins: CoinRegistryItem[] | null = null;
let cacheTimestamp = 0;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Fetches all USDT pairs from Binance and returns coins not already in the static registry.
 * Results are cached for 5 minutes to reduce API calls.
 */
export async function fetchDynamicCoins(): Promise<CoinRegistryItem[]> {
  // Return cache if fresh
  if (cachedDynamicCoins && Date.now() - cacheTimestamp < CACHE_TTL_MS) {
    return cachedDynamicCoins;
  }

  try {
    const response = await fetch('https://api.binance.com/api/v3/exchangeInfo?permissions=SPOT', {
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      return cachedDynamicCoins ?? [];
    }

    const data: BinanceExchangeInfo = await response.json();

    // Filter to USDT pairs that are actively trading
    const usdtPairs = data.symbols.filter(
      (s) => s.quoteAsset === 'USDT' && s.status === 'TRADING'
    );

    // Convert to CoinRegistryItem, excluding those already in static registry
    const dynamicCoins: CoinRegistryItem[] = usdtPairs
      .filter((s) => !getCoinByBinanceSymbol(s.symbol))
      .map((s) => ({
        symbol: s.baseAsset,
        name: s.baseAsset, // No friendly name available from Binance API
        coingeckoId: '', // Unknown — no logo/metadata will be available
        binanceSymbol: s.symbol,
        quoteAsset: 'USDT',
        isDefault: false,
        isActive: true,
      }));

    cachedDynamicCoins = dynamicCoins;
    cacheTimestamp = Date.now();

    return dynamicCoins;
  } catch {
    return cachedDynamicCoins ?? [];
  }
}

/**
 * Clears the dynamic coins cache, forcing a fresh fetch on next call.
 */
export function clearDynamicCoinsCache(): void {
  cachedDynamicCoins = null;
  cacheTimestamp = 0;
}
