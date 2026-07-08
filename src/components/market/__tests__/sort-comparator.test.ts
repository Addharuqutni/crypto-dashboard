import { describe, it, expect } from 'vitest';
import { compareMarketRows } from '../sort-comparator';
import type { MarketRow } from '@/types/market';

function makeRow(overrides: Partial<MarketRow> = {}): MarketRow {
  return {
    symbol: 'BTC',
    name: 'Bitcoin',
    isLive: false,
    isStale: false,
    ...overrides,
  };
}

describe('compareMarketRows', () => {
  it('sorts by marketCap desc', () => {
    const a = makeRow({ marketCap: 100 });
    const b = makeRow({ marketCap: 300 });
    expect(compareMarketRows(a, b, 'marketCap', 'desc')).toBeGreaterThan(0);
    expect(compareMarketRows(b, a, 'marketCap', 'desc')).toBeLessThan(0);
  });

  it('sorts by price asc', () => {
    const a = makeRow({ price: 100 });
    const b = makeRow({ price: 300 });
    expect(compareMarketRows(a, b, 'price', 'asc')).toBeLessThan(0);
    expect(compareMarketRows(b, a, 'price', 'asc')).toBeGreaterThan(0);
  });

  it('sorts by volume24h desc', () => {
    const a = makeRow({ volume24h: 500 });
    const b = makeRow({ volume24h: 1000 });
    expect(compareMarketRows(a, b, 'volume24h', 'desc')).toBeGreaterThan(0);
  });

  it('sorts by priceChangePercent24h asc', () => {
    const a = makeRow({ priceChangePercent24h: -2.5 });
    const b = makeRow({ priceChangePercent24h: 5.0 });
    expect(compareMarketRows(a, b, 'priceChangePercent24h', 'asc')).toBeLessThan(0);
  });

  it('returns 0 for equal values', () => {
    const a = makeRow({ marketCap: 100 });
    const b = makeRow({ marketCap: 100 });
    expect(compareMarketRows(a, b, 'marketCap', 'desc')).toBe(0);
  });

  it('treats undefined as 0', () => {
    const a = makeRow({ marketCap: undefined });
    const b = makeRow({ marketCap: 100 });
    expect(compareMarketRows(a, b, 'marketCap', 'desc')).toBeGreaterThan(0);
    expect(compareMarketRows(a, b, 'marketCap', 'asc')).toBeLessThan(0);
  });

  it('treats both undefined as 0 vs 0', () => {
    const a = makeRow({ marketCap: undefined });
    const b = makeRow({ marketCap: undefined });
    expect(compareMarketRows(a, b, 'marketCap', 'desc')).toBe(0);
  });
});
