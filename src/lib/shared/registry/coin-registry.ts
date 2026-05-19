import type { CoinRegistryItem } from '@/types/coin';

/**
 * Coin registry — verified mapping between UI symbol, Binance, and CoinGecko.
 * Contains top coins by market cap with verified CoinGecko IDs.
 * Additional coins can be fetched dynamically from Binance at runtime.
 */
export const COIN_REGISTRY: CoinRegistryItem[] = [
  // --- Top 20 (Tier 1) ---
  { symbol: 'BTC', name: 'Bitcoin', coingeckoId: 'bitcoin', binanceSymbol: 'BTCUSDT', quoteAsset: 'USDT', isDefault: true, isActive: true },
  { symbol: 'ETH', name: 'Ethereum', coingeckoId: 'ethereum', binanceSymbol: 'ETHUSDT', quoteAsset: 'USDT', isDefault: true, isActive: true },
  { symbol: 'BNB', name: 'BNB', coingeckoId: 'binancecoin', binanceSymbol: 'BNBUSDT', quoteAsset: 'USDT', isDefault: true, isActive: true },
  { symbol: 'SOL', name: 'Solana', coingeckoId: 'solana', binanceSymbol: 'SOLUSDT', quoteAsset: 'USDT', isDefault: true, isActive: true },
  { symbol: 'XRP', name: 'XRP', coingeckoId: 'ripple', binanceSymbol: 'XRPUSDT', quoteAsset: 'USDT', isDefault: true, isActive: true },
  { symbol: 'ADA', name: 'Cardano', coingeckoId: 'cardano', binanceSymbol: 'ADAUSDT', quoteAsset: 'USDT', isDefault: true, isActive: true },
  { symbol: 'DOGE', name: 'Dogecoin', coingeckoId: 'dogecoin', binanceSymbol: 'DOGEUSDT', quoteAsset: 'USDT', isDefault: true, isActive: true },
  { symbol: 'AVAX', name: 'Avalanche', coingeckoId: 'avalanche-2', binanceSymbol: 'AVAXUSDT', quoteAsset: 'USDT', isDefault: true, isActive: true },
  { symbol: 'DOT', name: 'Polkadot', coingeckoId: 'polkadot', binanceSymbol: 'DOTUSDT', quoteAsset: 'USDT', isDefault: true, isActive: true },
  { symbol: 'LINK', name: 'Chainlink', coingeckoId: 'chainlink', binanceSymbol: 'LINKUSDT', quoteAsset: 'USDT', isDefault: true, isActive: true },
  { symbol: 'TRX', name: 'TRON', coingeckoId: 'tron', binanceSymbol: 'TRXUSDT', quoteAsset: 'USDT', isDefault: true, isActive: true },
  { symbol: 'MATIC', name: 'Polygon', coingeckoId: 'matic-network', binanceSymbol: 'MATICUSDT', quoteAsset: 'USDT', isDefault: true, isActive: true },
  { symbol: 'TON', name: 'Toncoin', coingeckoId: 'the-open-network', binanceSymbol: 'TONUSDT', quoteAsset: 'USDT', isDefault: true, isActive: true },
  { symbol: 'SHIB', name: 'Shiba Inu', coingeckoId: 'shiba-inu', binanceSymbol: 'SHIBUSDT', quoteAsset: 'USDT', isDefault: true, isActive: true },
  { symbol: 'UNI', name: 'Uniswap', coingeckoId: 'uniswap', binanceSymbol: 'UNIUSDT', quoteAsset: 'USDT', isDefault: true, isActive: true },
  { symbol: 'ATOM', name: 'Cosmos', coingeckoId: 'cosmos', binanceSymbol: 'ATOMUSDT', quoteAsset: 'USDT', isDefault: true, isActive: true },
  { symbol: 'LTC', name: 'Litecoin', coingeckoId: 'litecoin', binanceSymbol: 'LTCUSDT', quoteAsset: 'USDT', isDefault: true, isActive: true },
  { symbol: 'BCH', name: 'Bitcoin Cash', coingeckoId: 'bitcoin-cash', binanceSymbol: 'BCHUSDT', quoteAsset: 'USDT', isDefault: true, isActive: true },
  { symbol: 'NEAR', name: 'NEAR Protocol', coingeckoId: 'near', binanceSymbol: 'NEARUSDT', quoteAsset: 'USDT', isDefault: true, isActive: true },
  { symbol: 'SUI', name: 'Sui', coingeckoId: 'sui', binanceSymbol: 'SUIUSDT', quoteAsset: 'USDT', isDefault: true, isActive: true },

  // --- Top 21-40 (Tier 2) ---
  { symbol: 'APT', name: 'Aptos', coingeckoId: 'aptos', binanceSymbol: 'APTUSDT', quoteAsset: 'USDT', isDefault: true, isActive: true },
  { symbol: 'ARB', name: 'Arbitrum', coingeckoId: 'arbitrum', binanceSymbol: 'ARBUSDT', quoteAsset: 'USDT', isDefault: true, isActive: true },
  { symbol: 'OP', name: 'Optimism', coingeckoId: 'optimism', binanceSymbol: 'OPUSDT', quoteAsset: 'USDT', isDefault: true, isActive: true },
  { symbol: 'FIL', name: 'Filecoin', coingeckoId: 'filecoin', binanceSymbol: 'FILUSDT', quoteAsset: 'USDT', isDefault: true, isActive: true },
  { symbol: 'ICP', name: 'Internet Computer', coingeckoId: 'internet-computer', binanceSymbol: 'ICPUSDT', quoteAsset: 'USDT', isDefault: true, isActive: true },
  { symbol: 'HBAR', name: 'Hedera', coingeckoId: 'hedera-hashgraph', binanceSymbol: 'HBARUSDT', quoteAsset: 'USDT', isDefault: true, isActive: true },
  { symbol: 'XLM', name: 'Stellar', coingeckoId: 'stellar', binanceSymbol: 'XLMUSDT', quoteAsset: 'USDT', isDefault: true, isActive: true },
  { symbol: 'VET', name: 'VeChain', coingeckoId: 'vechain', binanceSymbol: 'VETUSDT', quoteAsset: 'USDT', isDefault: true, isActive: true },
  { symbol: 'RENDER', name: 'Render', coingeckoId: 'render-token', binanceSymbol: 'RENDERUSDT', quoteAsset: 'USDT', isDefault: true, isActive: true },
  { symbol: 'INJ', name: 'Injective', coingeckoId: 'injective-protocol', binanceSymbol: 'INJUSDT', quoteAsset: 'USDT', isDefault: true, isActive: true },
  { symbol: 'FET', name: 'Fetch.ai', coingeckoId: 'fetch-ai', binanceSymbol: 'FETUSDT', quoteAsset: 'USDT', isDefault: true, isActive: true },
  { symbol: 'PEPE', name: 'Pepe', coingeckoId: 'pepe', binanceSymbol: 'PEPEUSDT', quoteAsset: 'USDT', isDefault: true, isActive: true },
  { symbol: 'TIA', name: 'Celestia', coingeckoId: 'celestia', binanceSymbol: 'TIAUSDT', quoteAsset: 'USDT', isDefault: true, isActive: true },
  { symbol: 'SEI', name: 'Sei', coingeckoId: 'sei-network', binanceSymbol: 'SEIUSDT', quoteAsset: 'USDT', isDefault: true, isActive: true },
  { symbol: 'AAVE', name: 'Aave', coingeckoId: 'aave', binanceSymbol: 'AAVEUSDT', quoteAsset: 'USDT', isDefault: true, isActive: true },
  { symbol: 'MKR', name: 'Maker', coingeckoId: 'maker', binanceSymbol: 'MKRUSDT', quoteAsset: 'USDT', isDefault: true, isActive: true },
  { symbol: 'GRT', name: 'The Graph', coingeckoId: 'the-graph', binanceSymbol: 'GRTUSDT', quoteAsset: 'USDT', isDefault: true, isActive: true },
  { symbol: 'ALGO', name: 'Algorand', coingeckoId: 'algorand', binanceSymbol: 'ALGOUSDT', quoteAsset: 'USDT', isDefault: true, isActive: true },
  { symbol: 'FTM', name: 'Fantom', coingeckoId: 'fantom', binanceSymbol: 'FTMUSDT', quoteAsset: 'USDT', isDefault: true, isActive: true },
  { symbol: 'THETA', name: 'Theta Network', coingeckoId: 'theta-token', binanceSymbol: 'THETAUSDT', quoteAsset: 'USDT', isDefault: true, isActive: true },

  // --- Top 41-60 (Tier 3) ---
  { symbol: 'RUNE', name: 'THORChain', coingeckoId: 'thorchain', binanceSymbol: 'RUNEUSDT', quoteAsset: 'USDT', isDefault: false, isActive: true },
  { symbol: 'WIF', name: 'dogwifhat', coingeckoId: 'dogwifcoin', binanceSymbol: 'WIFUSDT', quoteAsset: 'USDT', isDefault: false, isActive: true },
  { symbol: 'BONK', name: 'Bonk', coingeckoId: 'bonk', binanceSymbol: 'BONKUSDT', quoteAsset: 'USDT', isDefault: false, isActive: true },
  { symbol: 'JUP', name: 'Jupiter', coingeckoId: 'jupiter-exchange-solana', binanceSymbol: 'JUPUSDT', quoteAsset: 'USDT', isDefault: false, isActive: true },
  { symbol: 'FLOKI', name: 'Floki', coingeckoId: 'floki', binanceSymbol: 'FLOKIUSDT', quoteAsset: 'USDT', isDefault: false, isActive: true },
  { symbol: 'EOS', name: 'EOS', coingeckoId: 'eos', binanceSymbol: 'EOSUSDT', quoteAsset: 'USDT', isDefault: false, isActive: true },
  { symbol: 'SAND', name: 'The Sandbox', coingeckoId: 'the-sandbox', binanceSymbol: 'SANDUSDT', quoteAsset: 'USDT', isDefault: false, isActive: true },
  { symbol: 'MANA', name: 'Decentraland', coingeckoId: 'decentraland', binanceSymbol: 'MANAUSDT', quoteAsset: 'USDT', isDefault: false, isActive: true },
  { symbol: 'AXS', name: 'Axie Infinity', coingeckoId: 'axie-infinity', binanceSymbol: 'AXSUSDT', quoteAsset: 'USDT', isDefault: false, isActive: true },
  { symbol: 'IMX', name: 'Immutable', coingeckoId: 'immutable-x', binanceSymbol: 'IMXUSDT', quoteAsset: 'USDT', isDefault: false, isActive: true },
  { symbol: 'GALA', name: 'Gala', coingeckoId: 'gala', binanceSymbol: 'GALAUSDT', quoteAsset: 'USDT', isDefault: false, isActive: true },
  { symbol: 'CRV', name: 'Curve DAO', coingeckoId: 'curve-dao-token', binanceSymbol: 'CRVUSDT', quoteAsset: 'USDT', isDefault: false, isActive: true },
  { symbol: 'SNX', name: 'Synthetix', coingeckoId: 'havven', binanceSymbol: 'SNXUSDT', quoteAsset: 'USDT', isDefault: false, isActive: true },
  { symbol: 'DYDX', name: 'dYdX', coingeckoId: 'dydx', binanceSymbol: 'DYDXUSDT', quoteAsset: 'USDT', isDefault: false, isActive: true },
  { symbol: 'ENS', name: 'Ethereum Name Service', coingeckoId: 'ethereum-name-service', binanceSymbol: 'ENSUSDT', quoteAsset: 'USDT', isDefault: false, isActive: true },
  { symbol: 'LDO', name: 'Lido DAO', coingeckoId: 'lido-dao', binanceSymbol: 'LDOUSDT', quoteAsset: 'USDT', isDefault: false, isActive: true },
  { symbol: 'COMP', name: 'Compound', coingeckoId: 'compound-governance-token', binanceSymbol: 'COMPUSDT', quoteAsset: 'USDT', isDefault: false, isActive: true },
  { symbol: 'APE', name: 'ApeCoin', coingeckoId: 'apecoin', binanceSymbol: 'APEUSDT', quoteAsset: 'USDT', isDefault: false, isActive: true },
  { symbol: 'PENDLE', name: 'Pendle', coingeckoId: 'pendle', binanceSymbol: 'PENDLEUSDT', quoteAsset: 'USDT', isDefault: false, isActive: true },
  { symbol: 'W', name: 'Wormhole', coingeckoId: 'wormhole', binanceSymbol: 'WUSDT', quoteAsset: 'USDT', isDefault: false, isActive: true },

  // --- Top 61-80 (Tier 4) ---
  { symbol: 'CAKE', name: 'PancakeSwap', coingeckoId: 'pancakeswap-token', binanceSymbol: 'CAKEUSDT', quoteAsset: 'USDT', isDefault: false, isActive: true },
  { symbol: 'ZRX', name: '0x Protocol', coingeckoId: '0x', binanceSymbol: 'ZRXUSDT', quoteAsset: 'USDT', isDefault: false, isActive: true },
  { symbol: 'EGLD', name: 'MultiversX', coingeckoId: 'elrond-erd-2', binanceSymbol: 'EGLDUSDT', quoteAsset: 'USDT', isDefault: false, isActive: true },
  { symbol: 'XTZ', name: 'Tezos', coingeckoId: 'tezos', binanceSymbol: 'XTZUSDT', quoteAsset: 'USDT', isDefault: false, isActive: true },
  { symbol: 'IOTA', name: 'IOTA', coingeckoId: 'iota', binanceSymbol: 'IOTAUSDT', quoteAsset: 'USDT', isDefault: false, isActive: true },
  { symbol: 'NEO', name: 'Neo', coingeckoId: 'neo', binanceSymbol: 'NEOUSDT', quoteAsset: 'USDT', isDefault: false, isActive: true },
  { symbol: 'KAVA', name: 'Kava', coingeckoId: 'kava', binanceSymbol: 'KAVAUSDT', quoteAsset: 'USDT', isDefault: false, isActive: true },
  { symbol: 'ZIL', name: 'Zilliqa', coingeckoId: 'zilliqa', binanceSymbol: 'ZILUSDT', quoteAsset: 'USDT', isDefault: false, isActive: true },
  { symbol: 'ENJ', name: 'Enjin Coin', coingeckoId: 'enjincoin', binanceSymbol: 'ENJUSDT', quoteAsset: 'USDT', isDefault: false, isActive: true },
  { symbol: 'CHZ', name: 'Chiliz', coingeckoId: 'chiliz', binanceSymbol: 'CHZUSDT', quoteAsset: 'USDT', isDefault: false, isActive: true },
  { symbol: 'ONE', name: 'Harmony', coingeckoId: 'harmony', binanceSymbol: 'ONEUSDT', quoteAsset: 'USDT', isDefault: false, isActive: true },
  { symbol: 'MASK', name: 'Mask Network', coingeckoId: 'mask-network', binanceSymbol: 'MASKUSDT', quoteAsset: 'USDT', isDefault: false, isActive: true },
  { symbol: 'GMT', name: 'STEPN', coingeckoId: 'stepn', binanceSymbol: 'GMTUSDT', quoteAsset: 'USDT', isDefault: false, isActive: true },
  { symbol: 'LUNC', name: 'Terra Classic', coingeckoId: 'terra-luna', binanceSymbol: 'LUNCUSDT', quoteAsset: 'USDT', isDefault: false, isActive: true },
  { symbol: '1INCH', name: '1inch', coingeckoId: '1inch', binanceSymbol: '1INCHUSDT', quoteAsset: 'USDT', isDefault: false, isActive: true },
  { symbol: 'OCEAN', name: 'Ocean Protocol', coingeckoId: 'ocean-protocol', binanceSymbol: 'OCEANUSDT', quoteAsset: 'USDT', isDefault: false, isActive: true },
  { symbol: 'ROSE', name: 'Oasis Network', coingeckoId: 'oasis-network', binanceSymbol: 'ROSEUSDT', quoteAsset: 'USDT', isDefault: false, isActive: true },
  { symbol: 'CELO', name: 'Celo', coingeckoId: 'celo', binanceSymbol: 'CELOUSDT', quoteAsset: 'USDT', isDefault: false, isActive: true },
  { symbol: 'SKL', name: 'SKALE', coingeckoId: 'skale', binanceSymbol: 'SKLUSDT', quoteAsset: 'USDT', isDefault: false, isActive: true },
  { symbol: 'STORJ', name: 'Storj', coingeckoId: 'storj', binanceSymbol: 'STORJUSDT', quoteAsset: 'USDT', isDefault: false, isActive: true },
];

/** Lookup coin by UI symbol (e.g. "BTC") */
export function getCoinBySymbol(symbol: string): CoinRegistryItem | undefined {
  return COIN_REGISTRY.find((c) => c.symbol.toUpperCase() === symbol.toUpperCase());
}

/** Lookup coin by Binance trading pair (e.g. "BTCUSDT") */
export function getCoinByBinanceSymbol(binanceSymbol: string): CoinRegistryItem | undefined {
  return COIN_REGISTRY.find((c) => c.binanceSymbol.toUpperCase() === binanceSymbol.toUpperCase());
}

/** Lookup coin by CoinGecko id (e.g. "bitcoin") */
export function getCoinByCoinGeckoId(coingeckoId: string): CoinRegistryItem | undefined {
  return COIN_REGISTRY.find((c) => c.coingeckoId.toLowerCase() === coingeckoId.toLowerCase());
}

/**
 * Search coins by name or symbol.
 * Returns matching coins sorted by relevance (exact symbol match first).
 */
export function searchCoins(query: string): CoinRegistryItem[] {
  if (!query.trim()) return [];

  const q = query.trim().toLowerCase();

  return COIN_REGISTRY.filter(
    (c) =>
      c.isActive &&
      (c.symbol.toLowerCase().includes(q) || c.name.toLowerCase().includes(q))
  ).sort((a, b) => {
    // Exact symbol match first
    const aExact = a.symbol.toLowerCase() === q ? 0 : 1;
    const bExact = b.symbol.toLowerCase() === q ? 0 : 1;
    if (aExact !== bExact) return aExact - bExact;

    // Then starts-with symbol
    const aStarts = a.symbol.toLowerCase().startsWith(q) ? 0 : 1;
    const bStarts = b.symbol.toLowerCase().startsWith(q) ? 0 : 1;
    if (aStarts !== bStarts) return aStarts - bStarts;

    // Then alphabetical
    return a.name.localeCompare(b.name);
  });
}

/** Get all default coins shown across the main dashboard feeds. */
export function getDefaultCoins(): CoinRegistryItem[] {
  return COIN_REGISTRY.filter((c) => c.isActive);
}

/** Get all active coins (available for search and detail pages) */
export function getAllActiveCoins(): CoinRegistryItem[] {
  return COIN_REGISTRY.filter((c) => c.isActive);
}

/**
 * Resolve the Binance trading pair for a UI symbol.
 *
 * Prefers the registry entry so non-USDT quote pairs (e.g. USDC perpetuals)
 * stay correct as they're added; falls back to `<symbol>USDT` for off-registry
 * coins so dynamic symbols still work without breaking the API surface.
 */
export function resolveBinanceSymbol(symbol: string): string {
  const upper = symbol.toUpperCase();
  return getCoinBySymbol(upper)?.binanceSymbol ?? `${upper}USDT`;
}
