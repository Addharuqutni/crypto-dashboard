import type { Candle, ChartTimeframe } from '@/types/chart';
import { getCoinBySymbol } from '@/lib/registry/coin-registry';

/**
 * Binance USDⓈ-M Futures kline endpoint.
 * Using Futures for consistency with the WebSocket data pipeline.
 */
const BINANCE_FUTURES_KLINE_BASE = 'https://fapi.binance.com/fapi/v1';

/**
 * Timeframe to Binance kline interval mapping.
 * Each candle represents exactly 1 unit of the selected timeframe.
 * We fetch 200 candles for sufficient history and technical analysis.
 */
const TIMEFRAME_CONFIG: Record<ChartTimeframe, { interval: string; limit: number }> = {
  '5m': { interval: '5m', limit: 200 },
  '15m': { interval: '15m', limit: 200 },
  '30m': { interval: '30m', limit: 200 },
  '1H': { interval: '1h', limit: 200 },
  '4H': { interval: '4h', limit: 200 },
  '24H': { interval: '1d', limit: 120 },
  '7D': { interval: '1w', limit: 52 },
  '30D': { interval: '1M', limit: 36 },
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
  timeframe: ChartTimeframe
): Promise<Candle[]> {
  const coin = getCoinBySymbol(symbol);
  const binanceSymbol = coin?.binanceSymbol ?? `${symbol}USDT`;

  const config = TIMEFRAME_CONFIG[timeframe];

  let response: Response;
  try {
    response = await fetch(
      `${BINANCE_FUTURES_KLINE_BASE}/klines?symbol=${binanceSymbol}&interval=${config.interval}&limit=${config.limit}`,
      {
        headers: { Accept: 'application/json' },
      }
    );
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
