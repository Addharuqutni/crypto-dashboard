import type { ScreenerUniverseCoin } from './types';

/**
 * Static top-100 large-cap Binance USDⓈ-M futures perpetual universe.
 *
 * Order follows broad market-cap rank preference and includes only liquid USDT
 * perpetual symbols available on Binance Futures. Ranks are advisory metadata
 * for display/tie-breaks only; trade decisions stay fully deterministic.
 */
export const DEFAULT_SCREENER_UNIVERSE: readonly ScreenerUniverseCoin[] = Object.freeze([
  { symbol: 'BTCUSDT', baseAsset: 'BTC', quoteAsset: 'USDT', marketCapRank: 1 },
  { symbol: 'ETHUSDT', baseAsset: 'ETH', quoteAsset: 'USDT', marketCapRank: 2 },
  { symbol: 'BNBUSDT', baseAsset: 'BNB', quoteAsset: 'USDT', marketCapRank: 3 },
  { symbol: 'SOLUSDT', baseAsset: 'SOL', quoteAsset: 'USDT', marketCapRank: 4 },
  { symbol: 'XRPUSDT', baseAsset: 'XRP', quoteAsset: 'USDT', marketCapRank: 5 },
  { symbol: 'ADAUSDT', baseAsset: 'ADA', quoteAsset: 'USDT', marketCapRank: 6 },
  { symbol: 'DOGEUSDT', baseAsset: 'DOGE', quoteAsset: 'USDT', marketCapRank: 7 },
  { symbol: 'TRXUSDT', baseAsset: 'TRX', quoteAsset: 'USDT', marketCapRank: 8 },
  { symbol: 'LINKUSDT', baseAsset: 'LINK', quoteAsset: 'USDT', marketCapRank: 9 },
  { symbol: 'AVAXUSDT', baseAsset: 'AVAX', quoteAsset: 'USDT', marketCapRank: 10 },
  { symbol: 'SUIUSDT', baseAsset: 'SUI', quoteAsset: 'USDT', marketCapRank: 11 },
  { symbol: 'DOTUSDT', baseAsset: 'DOT', quoteAsset: 'USDT', marketCapRank: 12 },
  { symbol: 'LTCUSDT', baseAsset: 'LTC', quoteAsset: 'USDT', marketCapRank: 13 },
  { symbol: 'BCHUSDT', baseAsset: 'BCH', quoteAsset: 'USDT', marketCapRank: 14 },
  { symbol: 'UNIUSDT', baseAsset: 'UNI', quoteAsset: 'USDT', marketCapRank: 15 },
  { symbol: 'NEARUSDT', baseAsset: 'NEAR', quoteAsset: 'USDT', marketCapRank: 16 },
  { symbol: 'APTUSDT', baseAsset: 'APT', quoteAsset: 'USDT', marketCapRank: 17 },
  { symbol: 'ICPUSDT', baseAsset: 'ICP', quoteAsset: 'USDT', marketCapRank: 18 },
  { symbol: 'ETCUSDT', baseAsset: 'ETC', quoteAsset: 'USDT', marketCapRank: 19 },
  { symbol: 'POLUSDT', baseAsset: 'POL', quoteAsset: 'USDT', marketCapRank: 20 },
  { symbol: 'ARBUSDT', baseAsset: 'ARB', quoteAsset: 'USDT', marketCapRank: 21 },
  { symbol: 'OPUSDT', baseAsset: 'OP', quoteAsset: 'USDT', marketCapRank: 22 },
  { symbol: 'FILUSDT', baseAsset: 'FIL', quoteAsset: 'USDT', marketCapRank: 23 },
  { symbol: 'ATOMUSDT', baseAsset: 'ATOM', quoteAsset: 'USDT', marketCapRank: 24 },
  { symbol: 'HBARUSDT', baseAsset: 'HBAR', quoteAsset: 'USDT', marketCapRank: 25 },
  { symbol: 'INJUSDT', baseAsset: 'INJ', quoteAsset: 'USDT', marketCapRank: 26 },
  { symbol: 'VETUSDT', baseAsset: 'VET', quoteAsset: 'USDT', marketCapRank: 27 },
  { symbol: 'RENDERUSDT', baseAsset: 'RENDER', quoteAsset: 'USDT', marketCapRank: 28 },
  { symbol: 'TIAUSDT', baseAsset: 'TIA', quoteAsset: 'USDT', marketCapRank: 29 },
  { symbol: 'IMXUSDT', baseAsset: 'IMX', quoteAsset: 'USDT', marketCapRank: 30 },
  { symbol: 'SEIUSDT', baseAsset: 'SEI', quoteAsset: 'USDT', marketCapRank: 31 },
  { symbol: 'STXUSDT', baseAsset: 'STX', quoteAsset: 'USDT', marketCapRank: 32 },
  { symbol: 'GRTUSDT', baseAsset: 'GRT', quoteAsset: 'USDT', marketCapRank: 33 },
  { symbol: 'FETUSDT', baseAsset: 'FET', quoteAsset: 'USDT', marketCapRank: 34 },
  { symbol: 'AAVEUSDT', baseAsset: 'AAVE', quoteAsset: 'USDT', marketCapRank: 35 },
  { symbol: 'ALGOUSDT', baseAsset: 'ALGO', quoteAsset: 'USDT', marketCapRank: 36 },
  { symbol: 'MKRUSDT', baseAsset: 'MKR', quoteAsset: 'USDT', marketCapRank: 37 },
  { symbol: 'RUNEUSDT', baseAsset: 'RUNE', quoteAsset: 'USDT', marketCapRank: 38 },
  { symbol: 'FLOWUSDT', baseAsset: 'FLOW', quoteAsset: 'USDT', marketCapRank: 39 },
  { symbol: 'QNTUSDT', baseAsset: 'QNT', quoteAsset: 'USDT', marketCapRank: 40 },
  { symbol: 'JUPUSDT', baseAsset: 'JUP', quoteAsset: 'USDT', marketCapRank: 41 },
  { symbol: 'WLDUSDT', baseAsset: 'WLD', quoteAsset: 'USDT', marketCapRank: 42 },
  { symbol: 'PYTHUSDT', baseAsset: 'PYTH', quoteAsset: 'USDT', marketCapRank: 43 },
  { symbol: 'JTOUSDT', baseAsset: 'JTO', quoteAsset: 'USDT', marketCapRank: 44 },
  { symbol: 'MANTAUSDT', baseAsset: 'MANTA', quoteAsset: 'USDT', marketCapRank: 45 },
  { symbol: 'ENAUSDT', baseAsset: 'ENA', quoteAsset: 'USDT', marketCapRank: 46 },
  { symbol: 'STRKUSDT', baseAsset: 'STRK', quoteAsset: 'USDT', marketCapRank: 47 },
  { symbol: 'WIFUSDT', baseAsset: 'WIF', quoteAsset: 'USDT', marketCapRank: 48 },
  { symbol: '1000BONKUSDT', baseAsset: '1000BONK', quoteAsset: 'USDT', marketCapRank: 49 },
  { symbol: '1000PEPEUSDT', baseAsset: '1000PEPE', quoteAsset: 'USDT', marketCapRank: 50 },
  { symbol: '1000SHIBUSDT', baseAsset: '1000SHIB', quoteAsset: 'USDT', marketCapRank: 51 },
  { symbol: 'ORDIUSDT', baseAsset: 'ORDI', quoteAsset: 'USDT', marketCapRank: 52 },
  { symbol: '1000SATSUSDT', baseAsset: '1000SATS', quoteAsset: 'USDT', marketCapRank: 53 },
  { symbol: 'ARUSDT', baseAsset: 'AR', quoteAsset: 'USDT', marketCapRank: 54 },
  { symbol: 'SANDUSDT', baseAsset: 'SAND', quoteAsset: 'USDT', marketCapRank: 55 },
  { symbol: 'MANAUSDT', baseAsset: 'MANA', quoteAsset: 'USDT', marketCapRank: 56 },
  { symbol: 'AXSUSDT', baseAsset: 'AXS', quoteAsset: 'USDT', marketCapRank: 57 },
  { symbol: 'APEUSDT', baseAsset: 'APE', quoteAsset: 'USDT', marketCapRank: 58 },
  { symbol: 'EGLDUSDT', baseAsset: 'EGLD', quoteAsset: 'USDT', marketCapRank: 59 },
  { symbol: 'XTZUSDT', baseAsset: 'XTZ', quoteAsset: 'USDT', marketCapRank: 60 },
  { symbol: 'KASUSDT', baseAsset: 'KAS', quoteAsset: 'USDT', marketCapRank: 61 },
  { symbol: 'LDOUSDT', baseAsset: 'LDO', quoteAsset: 'USDT', marketCapRank: 62 },
  { symbol: 'CRVUSDT', baseAsset: 'CRV', quoteAsset: 'USDT', marketCapRank: 63 },
  { symbol: 'DYDXUSDT', baseAsset: 'DYDX', quoteAsset: 'USDT', marketCapRank: 64 },
  { symbol: 'SNXUSDT', baseAsset: 'SNX', quoteAsset: 'USDT', marketCapRank: 65 },
  { symbol: 'COMPUSDT', baseAsset: 'COMP', quoteAsset: 'USDT', marketCapRank: 66 },
  { symbol: 'GMXUSDT', baseAsset: 'GMX', quoteAsset: 'USDT', marketCapRank: 67 },
  { symbol: 'PENDLEUSDT', baseAsset: 'PENDLE', quoteAsset: 'USDT', marketCapRank: 68 },
  { symbol: 'RAYUSDT', baseAsset: 'RAY', quoteAsset: 'USDT', marketCapRank: 69 },
  { symbol: 'CAKEUSDT', baseAsset: 'CAKE', quoteAsset: 'USDT', marketCapRank: 70 },
  { symbol: 'MINAUSDT', baseAsset: 'MINA', quoteAsset: 'USDT', marketCapRank: 71 },
  { symbol: 'ROSEUSDT', baseAsset: 'ROSE', quoteAsset: 'USDT', marketCapRank: 72 },
  { symbol: 'KAVAUSDT', baseAsset: 'KAVA', quoteAsset: 'USDT', marketCapRank: 73 },
  { symbol: 'ZILUSDT', baseAsset: 'ZIL', quoteAsset: 'USDT', marketCapRank: 74 },
  { symbol: 'IOTAUSDT', baseAsset: 'IOTA', quoteAsset: 'USDT', marketCapRank: 75 },
  { symbol: 'NEOUSDT', baseAsset: 'NEO', quoteAsset: 'USDT', marketCapRank: 76 },
  { symbol: 'EOSUSDT', baseAsset: 'EOS', quoteAsset: 'USDT', marketCapRank: 77 },
  { symbol: 'WAVESUSDT', baseAsset: 'WAVES', quoteAsset: 'USDT', marketCapRank: 78 },
  { symbol: 'GALAUSDT', baseAsset: 'GALA', quoteAsset: 'USDT', marketCapRank: 79 },
  { symbol: 'CHZUSDT', baseAsset: 'CHZ', quoteAsset: 'USDT', marketCapRank: 80 },
  { symbol: 'ENJUSDT', baseAsset: 'ENJ', quoteAsset: 'USDT', marketCapRank: 81 },
  { symbol: 'BLURUSDT', baseAsset: 'BLUR', quoteAsset: 'USDT', marketCapRank: 82 },
  { symbol: 'CFXUSDT', baseAsset: 'CFX', quoteAsset: 'USDT', marketCapRank: 83 },
  { symbol: 'CKBUSDT', baseAsset: 'CKB', quoteAsset: 'USDT', marketCapRank: 84 },
  { symbol: 'ZECUSDT', baseAsset: 'ZEC', quoteAsset: 'USDT', marketCapRank: 85 },
  { symbol: 'DASHUSDT', baseAsset: 'DASH', quoteAsset: 'USDT', marketCapRank: 86 },
  { symbol: 'XMRUSDT', baseAsset: 'XMR', quoteAsset: 'USDT', marketCapRank: 87 },
  { symbol: 'ZRXUSDT', baseAsset: 'ZRX', quoteAsset: 'USDT', marketCapRank: 88 },
  { symbol: '1INCHUSDT', baseAsset: '1INCH', quoteAsset: 'USDT', marketCapRank: 89 },
  { symbol: 'BATUSDT', baseAsset: 'BAT', quoteAsset: 'USDT', marketCapRank: 90 },
  { symbol: 'LRCUSDT', baseAsset: 'LRC', quoteAsset: 'USDT', marketCapRank: 91 },
  { symbol: 'HOTUSDT', baseAsset: 'HOT', quoteAsset: 'USDT', marketCapRank: 92 },
  { symbol: 'ANKRUSDT', baseAsset: 'ANKR', quoteAsset: 'USDT', marketCapRank: 93 },
  { symbol: 'CELOUSDT', baseAsset: 'CELO', quoteAsset: 'USDT', marketCapRank: 94 },
  { symbol: 'SKLUSDT', baseAsset: 'SKL', quoteAsset: 'USDT', marketCapRank: 95 },
  { symbol: 'ONTUSDT', baseAsset: 'ONT', quoteAsset: 'USDT', marketCapRank: 96 },
  { symbol: 'QTUMUSDT', baseAsset: 'QTUM', quoteAsset: 'USDT', marketCapRank: 97 },
  { symbol: 'ONEUSDT', baseAsset: 'ONE', quoteAsset: 'USDT', marketCapRank: 98 },
  { symbol: 'IOSTUSDT', baseAsset: 'IOST', quoteAsset: 'USDT', marketCapRank: 99 },
  { symbol: 'ICXUSDT', baseAsset: 'ICX', quoteAsset: 'USDT', marketCapRank: 100 },
]);

/** Returns a mutable copy of the default universe. */
export function getDefaultUniverse(): ScreenerUniverseCoin[] {
  return DEFAULT_SCREENER_UNIVERSE.map((c) => ({ ...c }));
}

export function getScreenerUniverseFromEnv(defaultMaxSymbols = 100): ScreenerUniverseCoin[] {
  const universe = getDefaultUniverse();
  const maxSymbols = getEnvInt('SCREENER_MAX_SYMBOLS', defaultMaxSymbols, 1, universe.length);
  const raw = process.env.SCREENER_SYMBOLS;
  if (!raw?.trim()) return universe.slice(0, maxSymbols);

  const allowed = new Map(universe.map((coin) => [coin.symbol, coin]));
  const selected = raw
    .split(',')
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean)
    .map((symbol) => allowed.get(symbol))
    .filter((coin): coin is ScreenerUniverseCoin => Boolean(coin))
    .slice(0, maxSymbols);

  return selected.length > 0 ? selected : universe.slice(0, maxSymbols);
}

function getEnvInt(name: string, fallback: number, min: number, max: number): number {
  const raw = process.env[name];
  const parsed = raw ? Number.parseInt(raw, 10) : fallback;
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}
