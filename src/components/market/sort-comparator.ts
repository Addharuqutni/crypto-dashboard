import type { MarketRow } from '@/types/market';

export type SortKey = 'price' | 'priceChangePercent24h' | 'volume24h' | 'marketCap';
export type SortDir = 'asc' | 'desc';

export function compareMarketRows(a: MarketRow, b: MarketRow, key: SortKey, dir: SortDir): number {
  const aVal = a[key] ?? 0;
  const bVal = b[key] ?? 0;
  return dir === 'desc' ? bVal - aVal : aVal - bVal;
}
