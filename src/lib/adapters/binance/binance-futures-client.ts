import type { LivePrice } from '@/types/market';
import type {
  BinanceExchangeInfoResponse,
  BinanceExchangeInfoSymbol,
  BinanceRestTickerItem,
} from './binance-futures-types';
import { normalizeRestTicker } from './binance-futures-normalizers';

/**
 * Binance USDⓈ-M Futures REST API base.
 * @see https://developers.binance.com/docs/derivatives/usds-margined-futures/general-info
 */
const BINANCE_FUTURES_REST_BASE = 'https://fapi.binance.com/fapi/v1';

/** Default timeout for REST requests (ms). */
const DEFAULT_TIMEOUT = 5000;

/** Max retry attempts for transient errors. */
const MAX_RETRIES = 2;

/** Retryable HTTP status codes. */
const RETRYABLE_STATUS_CODES = new Set([408, 500, 502, 503, 504]);

/** Non-retryable rate limit codes — must back off, not retry immediately. */
const RATE_LIMIT_STATUS_CODES = new Set([429, 418]);

// --- Public API ---

/**
 * Fetches all active USDⓈ-M Futures perpetual USDT symbols from exchangeInfo.
 * Filters by: status=TRADING, contractType=PERPETUAL, quoteAsset=USDT.
 * Used to build the dynamic symbol registry for all-market streaming.
 */
export async function fetchFuturesSymbols(): Promise<BinanceExchangeInfoSymbol[]> {
  const url = `${BINANCE_FUTURES_REST_BASE}/exchangeInfo`;

  const response = await fetchWithTimeout(url, DEFAULT_TIMEOUT);
  if (!response.ok) return [];

  const data = (await response.json()) as BinanceExchangeInfoResponse;

  return data.symbols.filter(
    (s) =>
      s.status === 'TRADING' &&
      s.contractType === 'PERPETUAL' &&
      s.quoteAsset === 'USDT'
  );
}

/**
 * Fetches 24hr ticker snapshot for all Futures symbols.
 * Returns normalized LivePrice array for immediate store seeding.
 * Implements retry with exponential backoff for transient errors.
 */
export async function fetchAllTickerSnapshot(): Promise<LivePrice[]> {
  const url = `${BINANCE_FUTURES_REST_BASE}/ticker/24hr`;

  const response = await fetchWithRetry(url, MAX_RETRIES);
  if (!response || !response.ok) return [];

  const data = (await response.json()) as BinanceRestTickerItem[];

  return data
    .filter((item) => item.symbol.endsWith('USDT'))
    .map((item) => normalizeRestTicker(item))
    .filter((item): item is LivePrice => item !== null);
}

/**
 * Fetches 24hr ticker snapshot for specific symbols only.
 * More efficient when tracking a small watchlist.
 */
export async function fetchTickerSnapshotForSymbols(
  binanceSymbols: string[]
): Promise<LivePrice[]> {
  if (binanceSymbols.length === 0) return [];

  // Binance Futures supports batch symbol query via JSON array
  const symbolsParam = JSON.stringify(binanceSymbols);
  const url = `${BINANCE_FUTURES_REST_BASE}/ticker/24hr?symbols=${encodeURIComponent(symbolsParam)}`;

  const response = await fetchWithRetry(url, MAX_RETRIES);
  if (!response || !response.ok) return [];

  const data = (await response.json()) as BinanceRestTickerItem[];

  return data
    .map((item) => normalizeRestTicker(item))
    .filter((item): item is LivePrice => item !== null);
}

/**
 * Fetches raw 24hr ticker stats for a single Futures symbol.
 * Returns high, low, volume, quoteVolume for coin detail page.
 * Works for ANY Futures USDT pair — not limited to registry.
 */
export async function fetchSingleTicker24hr(
  binanceSymbol: string
): Promise<BinanceRestTickerItem | null> {
  const url = `${BINANCE_FUTURES_REST_BASE}/ticker/24hr?symbol=${binanceSymbol}`;

  const response = await fetchWithTimeout(url, DEFAULT_TIMEOUT);
  if (!response.ok) return null;

  const data = (await response.json()) as BinanceRestTickerItem;
  return data;
}


// --- Internal Helpers ---

/**
 * Fetch with AbortController timeout.
 * Prevents slow REST calls from blocking the application.
 */
async function fetchWithTimeout(url: string, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Fetch with retry and exponential backoff for transient errors.
 * Does NOT retry on rate limit (429/418) — returns null immediately.
 * Backoff: 200ms → 400ms → 800ms.
 */
async function fetchWithRetry(
  url: string,
  maxRetries: number
): Promise<Response | null> {
  let lastResponse: Response | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetchWithTimeout(url, DEFAULT_TIMEOUT);

      // Rate limited — do not retry, back off
      if (RATE_LIMIT_STATUS_CODES.has(response.status)) {
        console.warn(
          `[binance-futures-client] Rate limited (${response.status}). Backing off.`
        );
        return null;
      }

      // Success
      if (response.ok) {
        return response;
      }

      // Retryable server error
      if (RETRYABLE_STATUS_CODES.has(response.status) && attempt < maxRetries) {
        lastResponse = response;
        await sleep(200 * Math.pow(2, attempt));
        continue;
      }

      // Non-retryable client error
      return response;
    } catch {
      // Network error or abort — retry if attempts remain
      if (attempt < maxRetries) {
        await sleep(200 * Math.pow(2, attempt));
        continue;
      }
      return null;
    }
  }

  return lastResponse;
}

/** Simple sleep utility for backoff delays. */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
