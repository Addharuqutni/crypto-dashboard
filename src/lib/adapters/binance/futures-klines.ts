import type { Candle } from '@/types/chart';

/**
 * Server-side Binance Futures klines fetcher (Node-only).
 *
 * Mirrors the contract of `src/lib/adapters/api/binance-kline.ts` but is browser-free:
 *   - Uses Node's global `fetch` (Node ≥18).
 *   - Accepts an explicit `binanceSymbol` so it doesn't depend on the UI
 *     coin registry — server consumers are symbol-driven, not coin-driven.
 *   - Throws `KlineFetchError` so callers can distinguish network failures
 *     from malformed payloads.
 *
 * Both the worker (Telegram alert daemon) and the screener (read-only
 * ranking cycle) import this module — they MUST NOT import each other.
 */

const BINANCE_FUTURES_KLINE_BASE = 'https://fapi.binance.com/fapi/v1';

export class KlineFetchError extends Error {
  readonly status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.name = 'KlineFetchError';
    if (status !== undefined) this.status = status;
  }
}

export interface FetchKlinesArgs {
  binanceSymbol: string;
  /** Binance interval string (e.g. '15m', '30m', '4h'). */
  interval: string;
  /** Number of candles to request. Default 200, capped at 1500 by Binance. */
  limit?: number;
  /** Abort signal, e.g. for shutdown handling. */
  signal?: AbortSignal;
}

/**
 * Fetches futures klines from Binance and normalizes to the app `Candle` type.
 * Network errors and malformed payloads are surfaced as `KlineFetchError`
 * so the calling use case can decide whether to skip the symbol or fail.
 */
export async function fetchKlines(args: FetchKlinesArgs): Promise<Candle[]> {
  const limit = Math.min(Math.max(args.limit ?? 200, 1), 1500);
  const url = `${BINANCE_FUTURES_KLINE_BASE}/klines?symbol=${encodeURIComponent(args.binanceSymbol)}&interval=${encodeURIComponent(args.interval)}&limit=${limit}`;

  const fetchOpts: RequestInit = { headers: { Accept: 'application/json' } };
  if (args.signal) fetchOpts.signal = args.signal;

  let response: Response;
  try {
    response = await fetch(url, fetchOpts);
  } catch (err) {
    throw new KlineFetchError(
      `Network failure fetching ${args.binanceSymbol} ${args.interval}: ${(err as Error)?.message ?? 'unknown'}`
    );
  }

  if (!response.ok) {
    throw new KlineFetchError(
      `Binance error for ${args.binanceSymbol} ${args.interval}: HTTP ${response.status}`,
      response.status
    );
  }

  let data: unknown;
  try {
    data = await response.json();
  } catch (err) {
    throw new KlineFetchError(
      `Malformed kline response for ${args.binanceSymbol} ${args.interval}: ${(err as Error)?.message ?? 'invalid JSON'}`
    );
  }

  if (!Array.isArray(data)) {
    throw new KlineFetchError(
      `Unexpected kline payload shape for ${args.binanceSymbol} ${args.interval}`
    );
  }

  return data.map((row) => normalizeKline(row as RawKline, args.binanceSymbol));
}

type RawKline = [
  number, // open time
  string, // open
  string, // high
  string, // low
  string, // close
  string, // volume
  number, // close time
  string, // quote volume
  number, // trades
  string, // taker buy base
  string, // taker buy quote
  string, // ignore
];

/** Convert a raw Binance kline tuple into the app `Candle` shape. */
function normalizeKline(raw: RawKline, binanceSymbol: string): Candle {
  return {
    symbol: binanceSymbol.replace(/USDT$/i, '').replace(/USD$/i, ''),
    binanceSymbol,
    openTime: raw[0],
    open: parseFloat(raw[1]),
    high: parseFloat(raw[2]),
    low: parseFloat(raw[3]),
    close: parseFloat(raw[4]),
    volume: parseFloat(raw[5]),
    closeTime: raw[6],
  };
}
