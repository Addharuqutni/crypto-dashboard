import type { CoinMetadata } from '@/types/market';
import { getCoinByCoinGeckoId, getDefaultCoins } from '@/lib/shared/registry/coin-registry';

const COINGECKO_BASE = 'https://api.coingecko.com/api/v3';

/**
 * Fetch market data for all default coins from CoinGecko.
 * Returns normalized CoinMetadata array.
 * Handles rate limits and errors gracefully.
 */
export async function fetchCoinMarketData(): Promise<CoinMetadata[]> {
  const coins = getDefaultCoins();
  const ids = coins.map((c) => c.coingeckoId).join(',');

  try {
    const response = await fetch(
      `${COINGECKO_BASE}/coins/markets?vs_currency=usd&ids=${ids}&order=market_cap_desc&per_page=${coins.length}&page=1&sparkline=false&price_change_percentage=24h`,
      {
        headers: { Accept: 'application/json' },
        next: { revalidate: 120 }, // Cache for 2 minutes in Next.js
      }
    );

    if (!response.ok) {
      throw new Error(`CoinGecko API error: ${response.status}`);
    }

    const data = (await response.json()) as CoinGeckoMarketItem[];
    return data
      .map((item) => normalizeCoinGeckoMarket(item))
      .filter((item): item is CoinMetadata => item !== null);
  } catch (error) {
    console.error('[CoinGecko] Failed to fetch market data:', error);
    return [];
  }
}

/**
 * Fetch metadata for a single coin by CoinGecko ID.
 */
export async function fetchCoinMetadata(coingeckoId: string): Promise<CoinMetadata | null> {
  try {
    const response = await fetch(
      `${COINGECKO_BASE}/coins/markets?vs_currency=usd&ids=${coingeckoId}&sparkline=false&price_change_percentage=24h`,
      {
        headers: { Accept: 'application/json' },
        next: { revalidate: 120 },
      }
    );

    if (!response.ok) {
      throw new Error(`CoinGecko API error: ${response.status}`);
    }

    const data = (await response.json()) as CoinGeckoMarketItem[];
    if (data.length === 0) return null;

    return normalizeCoinGeckoMarket(data[0]!);
  } catch (error) {
    console.error(`[CoinGecko] Failed to fetch metadata for ${coingeckoId}:`, error);
    return null;
  }
}

// --- CoinGecko Types & Normalization ---

interface CoinGeckoMarketItem {
  id: string;
  symbol: string;
  name: string;
  image: string;
  current_price: number;
  market_cap: number;
  total_volume: number;
  high_24h: number;
  low_24h: number;
  price_change_percentage_24h: number;
}

/**
 * Normalize CoinGecko market item into internal CoinMetadata model.
 * Returns null if the coin is not in our registry.
 */
function normalizeCoinGeckoMarket(item: CoinGeckoMarketItem): CoinMetadata | null {
  const coin = getCoinByCoinGeckoId(item.id);
  if (!coin) return null;

  return {
    symbol: coin.symbol,
    coingeckoId: item.id,
    name: item.name,
    logoUrl: item.image,
    marketCap: item.market_cap,
    volume24h: item.total_volume,
    high24h: item.high_24h,
    low24h: item.low_24h,
    source: 'coingecko',
    fetchedAt: Date.now(),
  };
}
