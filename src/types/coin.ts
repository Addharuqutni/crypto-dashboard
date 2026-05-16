/**
 * Core coin registry item — maps UI symbol to Binance and CoinGecko identifiers.
 * This is the single source of truth for supported coins.
 */
export type CoinRegistryItem = {
  symbol: string;
  name: string;
  coingeckoId: string;
  binanceSymbol: string;
  quoteAsset: 'USDT';
  logoUrl?: string;
  isDefault: boolean;
  isActive: boolean;
};
