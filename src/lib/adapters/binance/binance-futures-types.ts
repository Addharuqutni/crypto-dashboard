/**
 * Binance USDⓈ-M Futures API types.
 * Centralized type definitions for REST and WebSocket payloads.
 * @see https://developers.binance.com/docs/derivatives/usds-margined-futures/general-info
 */

// --- REST Types ---

/**
 * Symbol info from /fapi/v1/exchangeInfo response.
 * Only fields relevant to this project are typed.
 */
export interface BinanceExchangeInfoSymbol {
  symbol: string;
  pair: string;
  contractType: string;
  deliveryDate: number;
  onboardDate: number;
  status: string;
  baseAsset: string;
  quoteAsset: string;
  marginAsset: string;
  pricePrecision: number;
  quantityPrecision: number;
}

/**
 * Full exchangeInfo response shape (partial).
 */
export interface BinanceExchangeInfoResponse {
  timezone: string;
  serverTime: number;
  symbols: BinanceExchangeInfoSymbol[];
}

/**
 * 24hr ticker item from /fapi/v1/ticker/24hr.
 */
export interface BinanceRestTickerItem {
  symbol: string;
  priceChange: string;
  priceChangePercent: string;
  weightedAvgPrice: string;
  lastPrice: string;
  lastQty: string;
  openPrice: string;
  highPrice: string;
  lowPrice: string;
  volume: string;
  quoteVolume: string;
  openTime: number;
  closeTime: number;
  count: number;
}

// --- WebSocket Types ---

/**
 * Mini ticker event from @miniTicker or !miniTicker@arr stream.
 * Identical shape for individual and all-market streams.
 */
export interface BinanceMiniTickerEvent {
  e: '24hrMiniTicker';
  E: number;
  s: string;
  c: string;
  o: string;
  h: string;
  l: string;
  v: string;
  q: string;
}

/**
 * Book ticker event from @bookTicker stream.
 * Best bid/ask price and quantity.
 */
export interface BinanceBookTickerEvent {
  e: 'bookTicker';
  u: number;
  s: string;
  b: string;
  B: string;
  a: string;
  A: string;
  T: number;
  E: number;
}

/**
 * Server shutdown event — Binance sends this before disconnecting.
 */
export interface BinanceServerShutdownEvent {
  e: 'serverShutdown';
  E: number;
}

/**
 * Union of all known WebSocket event types this client handles.
 */
export type BinanceWebSocketEvent =
  | BinanceMiniTickerEvent
  | BinanceBookTickerEvent
  | BinanceServerShutdownEvent;

// --- Futures Symbol Filter ---

/**
 * Criteria for filtering active USDⓈ-M Futures perpetual symbols.
 */
export interface FuturesSymbolFilter {
  status: 'TRADING';
  contractType: 'PERPETUAL';
  quoteAsset: 'USDT';
}
