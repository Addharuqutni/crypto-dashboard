/**
 * Live price data from Binance WebSocket stream.
 */
export type LivePrice = {
  symbol: string;
  binanceSymbol: string;
  price: number;
  priceChangePercent24h?: number;
  eventTime: number;
  receivedAt: number;
  source: 'binance';
};

/**
 * Coin metadata from CoinGecko REST API.
 */
export type CoinMetadata = {
  symbol: string;
  coingeckoId: string;
  name: string;
  logoUrl?: string;
  marketCap?: number;
  volume24h?: number;
  high24h?: number;
  low24h?: number;
  source: 'coingecko';
  fetchedAt: number;
};

/**
 * Normalized market row for UI tables and cards.
 * Combines live price and metadata into a single display-ready shape.
 */
export type MarketRow = {
  symbol: string;
  name: string;
  logoUrl?: string;
  price?: number;
  priceChangePercent24h?: number;
  volume24h?: number;
  marketCap?: number;
  high24h?: number;
  low24h?: number;
  isLive: boolean;
  isStale: boolean;
  lastUpdatedAt?: number;
};

/**
 * Watchlist item stored in localStorage.
 */
export type WatchlistItem = {
  symbol: string;
  name: string;
  addedAt: string;
};

/**
 * Theme preference for the application.
 */
export type ThemePreference = 'dark' | 'light' | 'system';

/**
 * WebSocket connection status.
 */
export type ConnectionStatus = 'connected' | 'reconnecting' | 'disconnected';
