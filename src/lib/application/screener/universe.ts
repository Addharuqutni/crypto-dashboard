import type { ScreenerUniverseCoin } from './types';

/**
 * Static top-10 USDⓈ-M futures perpetual universe.
 *
 * The list is intentionally hand-curated and frozen so screener output stays
 * deterministic across runs. Market-cap ranks reflect the broad consensus
 * snapshot used during Phase 1 design and are advisory only — the screener
 * never trusts ranks for trade decisions, only for ordering ties.
 *
 * To extend or refresh the universe, update this constant. Do not expand it
 * dynamically inside the runner — the screener must remain reproducible.
 */
export const DEFAULT_SCREENER_UNIVERSE: readonly ScreenerUniverseCoin[] = Object.freeze([
  { symbol: 'BTCUSDT', baseAsset: 'BTC', quoteAsset: 'USDT', marketCapRank: 1 },
  { symbol: 'ETHUSDT', baseAsset: 'ETH', quoteAsset: 'USDT', marketCapRank: 2 },
  { symbol: 'BNBUSDT', baseAsset: 'BNB', quoteAsset: 'USDT', marketCapRank: 3 },
  { symbol: 'SOLUSDT', baseAsset: 'SOL', quoteAsset: 'USDT', marketCapRank: 4 },
  { symbol: 'XRPUSDT', baseAsset: 'XRP', quoteAsset: 'USDT', marketCapRank: 5 },
  { symbol: 'ADAUSDT', baseAsset: 'ADA', quoteAsset: 'USDT', marketCapRank: 6 },
  { symbol: 'DOGEUSDT', baseAsset: 'DOGE', quoteAsset: 'USDT', marketCapRank: 7 },
  { symbol: 'AVAXUSDT', baseAsset: 'AVAX', quoteAsset: 'USDT', marketCapRank: 8 },
  { symbol: 'TRXUSDT', baseAsset: 'TRX', quoteAsset: 'USDT', marketCapRank: 9 },
  { symbol: 'LINKUSDT', baseAsset: 'LINK', quoteAsset: 'USDT', marketCapRank: 10 },
]);

/** Returns a mutable copy of the default universe. */
export function getDefaultUniverse(): ScreenerUniverseCoin[] {
  return DEFAULT_SCREENER_UNIVERSE.map((c) => ({ ...c }));
}
