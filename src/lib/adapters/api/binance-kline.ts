import type { Candle, ChartTimeframe } from '@/types/chart';
import { getCoinBySymbol } from '@/lib/shared/registry/coin-registry';

/**
 * Binance USDⓈ-M Futures kline endpoint.
 * Using Futures for consistency with the WebSocket data pipeline.
 */
const BINANCE_FUTURES_KLINE_BASE = 'https://fapi.binance.com/fapi/v1';

/** Binance's per-request kline cap. */
export const BINANCE_KLINE_MAX_PER_REQUEST = 1500;

/**
 * Default kline counts per timeframe for the live charts. Short intraday
 * TFs fetch 1500 candles for maximum Binance single-request depth, while
 * higher TFs keep 1000 candles so indicators and S/R have enough history to
 * stabilize on first paint. Historical validation paths still pass an explicit `limit`
 * override when they need deeper history.
 *
 * Binance's per-request cap is 1500, so all defaults stay a single round-trip.
 */
const TIMEFRAME_CONFIG: Record<ChartTimeframe, { interval: string; limit: number }> = {
  '5m': { interval: '5m', limit: 1500 },
  '15m': { interval: '15m', limit: 1500 },
  '30m': { interval: '30m', limit: 1500 },
  '1H': { interval: '1h', limit: 1000 },
  '4H': { interval: '4h', limit: 1000 },
  '24H': { interval: '1d', limit: 1000 },
  '7D': { interval: '1w', limit: 1000 },
  '30D': { interval: '1M', limit: 1000 },
};

/**
 * Custom error thrown when the Binance Futures kline endpoint fails or
 * returns an unexpected payload. Allows callers (TanStack Query, error
 * boundaries, telemetry) to differentiate between empty success and a
 * real upstream failure.
 */
export class KlineFetchError extends Error {
  /** HTTP status when available; undefined for network/parse failures. */
  readonly status?: number;

  constructor(message: string, status?: number) {
    super(message);
    this.name = 'KlineFetchError';
    this.status = status;
  }
}

/**
 * Optional overrides for `fetchKlineData`.
 *
 * - `limit` is capped at Binance's hard 1500 per request. For more candles
 *   than that use `fetchHistoricalKlines`, which paginates.
 * - `endTime` selects the upper bound of the requested window. Binance returns
 *   candles whose `closeTime <= endTime`. Used by the pagination helper.
 */
export interface FetchKlineOptions {
  limit?: number;
  endTime?: number;
}

/**
 * Fetch historical kline (candlestick) data from Binance Futures.
 * Works for ANY coin with a USDT perpetual pair — not limited to registry.
 * Falls back to derived binanceSymbol (SYMBOL + USDT) for non-registry coins.
 *
 * Throws `KlineFetchError` on HTTP failure, network failure, or malformed
 * response. The caller (typically a TanStack Query queryFn) decides how to
 * surface the failure to the UI.
 */
export async function fetchKlineData(
  symbol: string,
  timeframe: ChartTimeframe,
  options: FetchKlineOptions = {}
): Promise<Candle[]> {
  const coin = getCoinBySymbol(symbol);
  const binanceSymbol = coin?.binanceSymbol ?? `${symbol}USDT`;

  const config = TIMEFRAME_CONFIG[timeframe];
  const requested = options.limit ?? config.limit;
  const limit = Math.min(Math.max(requested, 1), BINANCE_KLINE_MAX_PER_REQUEST);

  const params = new URLSearchParams({
    symbol: binanceSymbol,
    interval: config.interval,
    limit: String(limit),
  });
  if (options.endTime != null && Number.isFinite(options.endTime)) {
    params.set('endTime', String(Math.floor(options.endTime)));
  }

  let response: Response;
  try {
    response = await fetch(`${BINANCE_FUTURES_KLINE_BASE}/klines?${params.toString()}`, {
      headers: { Accept: 'application/json' },
    });
  } catch (error) {
    throw new KlineFetchError(
      `Network failure fetching ${symbol}/${timeframe} klines: ${(error as Error)?.message ?? 'unknown'}`
    );
  }

  if (!response.ok) {
    throw new KlineFetchError(
      `Binance Futures Kline API error for ${symbol}/${timeframe} (status ${response.status})`,
      response.status
    );
  }

  let data: BinanceKlineRaw[];
  try {
    data = (await response.json()) as BinanceKlineRaw[];
  } catch (error) {
    throw new KlineFetchError(
      `Malformed kline response for ${symbol}/${timeframe}: ${(error as Error)?.message ?? 'invalid JSON'}`
    );
  }

  if (!Array.isArray(data)) {
    throw new KlineFetchError(`Unexpected kline payload shape for ${symbol}/${timeframe}`);
  }

  return data.map((kline) => normalizeKline(kline, symbol, binanceSymbol));
}

// --- Binance Kline Types & Normalization ---

/**
 * Binance kline raw array format.
 * @see https://binance-docs.github.io/apidocs/spot/en/#kline-candlestick-data
 */
type BinanceKlineRaw = [
  number, // 0: Open time
  string, // 1: Open
  string, // 2: High
  string, // 3: Low
  string, // 4: Close
  string, // 5: Volume
  number, // 6: Close time
  string, // 7: Quote asset volume
  number, // 8: Number of trades
  string, // 9: Taker buy base asset volume
  string, // 10: Taker buy quote asset volume
  string, // 11: Ignore
];

/**
 * Normalize Binance kline raw array into internal Candle model.
 */
function normalizeKline(kline: BinanceKlineRaw, symbol: string, binanceSymbol: string): Candle {
  return {
    symbol,
    binanceSymbol,
    openTime: kline[0],
    open: parseFloat(kline[1]),
    high: parseFloat(kline[2]),
    low: parseFloat(kline[3]),
    close: parseFloat(kline[4]),
    volume: parseFloat(kline[5]),
    closeTime: kline[6],
  };
}

/**
 * Fetch up to `total` candles by paginating backward from the most recent bar.
 *
 * Why this exists:
 *   The single-call `fetchKlineData` is capped by Binance at 1500 candles per
 *   request. Historical validation routinely wants more (e.g. 2000–5000 30m bars for a
 *   week-plus replay), so we walk the window backward in 1500-bar chunks
 *   using each chunk's earliest `openTime - 1ms` as the next `endTime`.
 *
 * Guarantees:
 *   - Returns candles sorted by `openTime` ascending, deduplicated.
 *   - Stops cleanly when Binance returns fewer rows than requested (means we
 *     have hit the start of the available history for that symbol).
 *   - Bounded loop (`MAX_PAGES`) so a misbehaving symbol can't spin forever.
 *
 * Errors propagate as `KlineFetchError` from the underlying `fetchKlineData`.
 */
export async function fetchHistoricalKlines(
  symbol: string,
  timeframe: ChartTimeframe,
  total: number
): Promise<Candle[]> {
  const target = Math.max(1, Math.floor(total));
  if (target <= BINANCE_KLINE_MAX_PER_REQUEST) {
    return fetchKlineData(symbol, timeframe, { limit: target });
  }

  const MAX_PAGES = 20; // 1500 * 20 = 30k candles, well above any practical UI need
  const collected: Candle[] = [];
  let endTime: number | undefined;

  for (let page = 0; page < MAX_PAGES; page++) {
    const remaining = target - collected.length;
    if (remaining <= 0) break;
    const limit = Math.min(remaining, BINANCE_KLINE_MAX_PER_REQUEST);

    const opts: FetchKlineOptions = { limit };
    if (endTime !== undefined) opts.endTime = endTime;
    const chunk = await fetchKlineData(symbol, timeframe, opts);
    if (chunk.length === 0) break;

    collected.push(...chunk);

    // If Binance returned less than asked, we hit the symbol's earliest data.
    if (chunk.length < limit) break;

    // Walk backward by 1ms before the earliest openTime in this chunk to
    // avoid fetching the same row twice on the next iteration.
    const earliest = chunk[0]?.openTime;
    if (earliest == null) break;
    endTime = earliest - 1;
  }

  // Sort + dedupe by openTime. Pagination order is back-to-front so we need
  // to flip the result, and overlapping windows could in theory duplicate.
  const seen = new Set<number>();
  const sorted = collected
    .filter((c) => {
      if (seen.has(c.openTime)) return false;
      seen.add(c.openTime);
      return true;
    })
    .sort((a, b) => a.openTime - b.openTime);

  // Trim to the most recent `target` bars so the caller always knows the
  // window size matches what they asked for (or less, on insufficient data).
  if (sorted.length > target) return sorted.slice(-target);
  return sorted;
}

