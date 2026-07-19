import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchCoinMarketData, fetchCoinMetadata } from '../coingecko';
import { fetchFearGreedIndex } from '../fear-greed';

const ORIGINAL_FETCH = globalThis.fetch;
type FetchMock = ReturnType<typeof vi.fn>;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

afterEach(() => {
  globalThis.fetch = ORIGINAL_FETCH;
  vi.restoreAllMocks();
});

describe('market API adapters', () => {
  it('normalizes CoinGecko market data and drops unknown coins', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      jsonResponse([
        {
          id: 'bitcoin',
          symbol: 'btc',
          name: 'Bitcoin',
          image: 'btc.png',
          current_price: 65000,
          market_cap: 1,
          total_volume: 2,
          high_24h: 66000,
          low_24h: 64000,
          price_change_percentage_24h: 3,
        },
        {
          id: 'unknown-coin',
          symbol: 'wat',
          name: 'Unknown',
          image: '',
          current_price: 1,
          market_cap: 1,
          total_volume: 1,
          high_24h: 1,
          low_24h: 1,
          price_change_percentage_24h: 0,
        },
      ])
    ) as unknown as typeof fetch;

    const rows = await fetchCoinMarketData();

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      symbol: 'BTC',
      coingeckoId: 'bitcoin',
      name: 'Bitcoin',
      source: 'coingecko',
    });
  });

  it('returns null for missing CoinGecko metadata and [] on API failure', async () => {
    const fetchMock: FetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse([]))
      .mockResolvedValueOnce(jsonResponse({ error: 'rate limited' }, 429));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await expect(fetchCoinMetadata('bitcoin')).resolves.toBeNull();
    await expect(fetchCoinMarketData()).resolves.toEqual([]);
  });

  it('normalizes Fear & Greed response and fails closed on bad values', async () => {
    const fetchMock: FetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ data: [{ value: '76', timestamp: '1000' }] }))
      .mockResolvedValueOnce(jsonResponse({ data: [{ value: 'nope', timestamp: '1000' }] }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await expect(fetchFearGreedIndex()).resolves.toMatchObject({
      value: 76,
      label: 'Extreme Greed',
      timestamp: 1_000_000,
    });
    await expect(fetchFearGreedIndex()).resolves.toBeNull();
  });
});
