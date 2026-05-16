/**
 * Barrel export for Binance Futures module.
 * Provides clean import paths for consumers.
 */
export { fetchFuturesSymbols, fetchAllTickerSnapshot, fetchTickerSnapshotForSymbols } from './binance-futures-client';
export { normalizeMiniTicker, normalizeMiniTickerBatch, normalizeRestTicker, isMiniTickerEvent } from './binance-futures-normalizers';
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
