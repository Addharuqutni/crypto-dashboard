import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchHistoricalKlines, BINANCE_KLINE_MAX_PER_REQUEST } from '../binance-kline';

/**
 * Tests for the paginated kline fetcher.
 *
 * We mock global fetch directly so we can shape the per-request response and
 * assert the URL/query-param behaviour. This avoids spinning up an HTTP server
 * while still exercising the URL construction and pagination loop.
 */

type FetchMock = ReturnType<typeof vi.fn>;

const ORIGINAL_FETCH = globalThis.fetch;

function makeKlineRow(openTime: number): unknown[] {
  return [
    openTime,
    '100',
    '101',
    '99',
    '100.5',
    '10',
    openTime + 1_799_999, // 30m closeTime offset
    '1000',
    20,
    '5',
    '500',
    '0',
  ];
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

beforeEach(() => {
  // Each test installs its own mock; default behaviour is "no fetch yet".
});

afterEach(() => {
  globalThis.fetch = ORIGINAL_FETCH;
  vi.restoreAllMocks();
});

describe('fetchHistoricalKlines', () => {
  it('uses a single fetch when total <= per-request cap', async () => {
    const rows = Array.from({ length: 800 }, (_, i) => makeKlineRow(i * 1_800_000));
    const fetchMock: FetchMock = vi.fn().mockResolvedValue(jsonResponse(rows));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const out = await fetchHistoricalKlines('BTC', '30m', 800);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(out.length).toBe(800);

    const url = new URL(fetchMock.mock.calls[0]![0] as string);
    expect(url.searchParams.get('limit')).toBe('800');
    expect(url.searchParams.has('endTime')).toBe(false);
  });

  it('paginates backward when total exceeds the per-request cap', async () => {
    // Simulate 3000 sequential 30m candles. Each chunk is 1500 of them.
    const allRows = Array.from({ length: 3000 }, (_, i) =>
      makeKlineRow(i * 1_800_000)
    );

    const fetchMock: FetchMock = vi.fn(async (input: string) => {
      const url = new URL(input);
      const limit = Number(url.searchParams.get('limit'));
      const endTimeParam = url.searchParams.get('endTime');
      // First call has no endTime → newest 1500. Second call has endTime →
      // bars closing on or before that time → previous 1500.
      if (endTimeParam == null) {
        return jsonResponse(allRows.slice(-limit));
      }
      const endTime = Number(endTimeParam);
      // Bars whose closeTime <= endTime, take last `limit` of those.
      const filtered = allRows.filter((r) => (r[6] as number) <= endTime);
      return jsonResponse(filtered.slice(-limit));
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const out = await fetchHistoricalKlines('BTC', '30m', 3000);
    // Two pages: 1500 + 1500.
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(out.length).toBe(3000);

    // Result must be sorted ascending by openTime and contain no duplicates.
    for (let i = 1; i < out.length; i++) {
      expect(out[i]!.openTime).toBeGreaterThan(out[i - 1]!.openTime);
    }
  });

  it('stops cleanly when Binance returns fewer rows than asked', async () => {
    // Symbol with only 800 candles total but caller asked for 3000.
    const allRows = Array.from({ length: 800 }, (_, i) => makeKlineRow(i * 1_800_000));

    const fetchMock: FetchMock = vi.fn(async (input: string) => {
      const url = new URL(input);
      const limit = Number(url.searchParams.get('limit'));
      const endTimeParam = url.searchParams.get('endTime');
      if (endTimeParam == null) return jsonResponse(allRows.slice(-limit));
      const endTime = Number(endTimeParam);
      const filtered = allRows.filter((r) => (r[6] as number) <= endTime);
      return jsonResponse(filtered.slice(-limit));
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const out = await fetchHistoricalKlines('BTC', '30m', 3000);
    // First page returns 800 (less than requested 1500) → loop bails.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(out.length).toBe(800);
  });

  it('caps single-call limit at the per-request maximum', async () => {
    const rows = Array.from({ length: BINANCE_KLINE_MAX_PER_REQUEST }, (_, i) =>
      makeKlineRow(i * 1_800_000)
    );
    const fetchMock: FetchMock = vi.fn().mockResolvedValue(jsonResponse(rows));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await fetchHistoricalKlines('BTC', '30m', BINANCE_KLINE_MAX_PER_REQUEST);
    const url = new URL(fetchMock.mock.calls[0]![0] as string);
    expect(url.searchParams.get('limit')).toBe(String(BINANCE_KLINE_MAX_PER_REQUEST));
  });
});
