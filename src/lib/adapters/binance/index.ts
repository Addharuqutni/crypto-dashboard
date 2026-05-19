/**
 * Barrel export for Binance Futures module.
 *
 * Provides clean import paths for all Binance Futures consumers (worker,
 * screener, UI hooks). This is the single canonical surface for
 * Binance-related types and adapters.
 */
export {
  fetchFuturesSymbols,
  fetchAllTickerSnapshot,
  fetchTickerSnapshotForSymbols,
} from './binance-futures-client';
export {
  normalizeMiniTicker,
  normalizeMiniTickerBatch,
  normalizeRestTicker,
  isMiniTickerEvent,
} from './binance-futures-normalizers';
export type {
  BinanceExchangeInfoSymbol,
  BinanceExchangeInfoResponse,
  BinanceRestTickerItem,
  BinanceMiniTickerEvent,
  BinanceBookTickerEvent,
  BinanceServerShutdownEvent,
  BinanceWebSocketEvent,
  FuturesSymbolFilter,
} from './binance-futures-types';

// Server-side klines fetcher (Node-only) — shared by worker + screener.
export { fetchKlines, KlineFetchError, type FetchKlinesArgs } from './futures-klines';

// Canonical Binance interval type — shared by all Binance-driven features.
export { BINANCE_INTERVALS, type BinanceInterval } from './intervals';
