import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { ScreenerUniverseCoin } from './types';
import { getDefaultUniverse } from './universe';

export type UniverseSource = 'dynamic' | 'fallback_static';

export interface DynamicUniverseResult {
  source: UniverseSource;
  coins: ScreenerUniverseCoin[];
  fetchedAt: number;
  /** Reason for fallback when source is fallback_static. */
  fallbackReason?: string;
}

interface CachedUniverse {
  source: UniverseSource;
  coins: ScreenerUniverseCoin[];
  fetchedAt: number;
}

const COINGECKO_TOP_MARKETS_URL =
  'https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=20&page=1&sparkline=false';

const BINANCE_FUTURES_EXCHANGE_INFO_URL =
  'https://fapi.binance.com/fapi/v1/exchangeInfo';

const CACHE_FILE = path.join(process.cwd(), 'data', 'screener', 'universe-cache.json');
const CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24h
const FETCH_TIMEOUT_MS = 8_000;

/**
 * Resolve the screener universe.
 *
 * Strategy:
 *   1. Read cache; return if fresh.
 *   2. Fetch top market caps from CoinGecko.
 *   3. Validate availability on Binance USDⓈ-M Futures.
 *   4. Cache result.
 *   5. On any failure, fall back to the static top 10.
 *
 * Failures never throw — the screener must always have a usable universe.
 */
export async function resolveDynamicUniverse(
  options: { topN?: number; cacheFile?: string; now?: () => number } = {}
): Promise<DynamicUniverseResult> {
  const topN = options.topN ?? 10;
  const cacheFile = options.cacheFile ?? CACHE_FILE;
  const now = (options.now ?? Date.now)();

  // 1. Cache hit?
  const cached = await readCache(cacheFile);
  if (cached && now - cached.fetchedAt < CACHE_MAX_AGE_MS && cached.coins.length >= topN) {
    return { source: cached.source, coins: cached.coins.slice(0, topN), fetchedAt: cached.fetchedAt };
  }

  // 2. Try dynamic fetch.
  try {
    const coins = await fetchAndValidate(topN);
    if (coins.length >= topN) {
      const result: DynamicUniverseResult = {
        source: 'dynamic',
        coins: coins.slice(0, topN),
        fetchedAt: now,
      };
      await writeCache(cacheFile, { source: 'dynamic', coins, fetchedAt: now });
      return result;
    }
    return fallback(now, `dynamic_universe_too_small (got ${coins.length}, need ${topN})`);
  } catch (err) {
    const reason = err instanceof Error ? err.message : 'unknown_error';
    return fallback(now, `dynamic_universe_fetch_failed: ${reason}`);
  }
}

/**
 * Fetch top market caps from CoinGecko and intersect with Binance USDⓈ-M Futures.
 */
async function fetchAndValidate(topN: number): Promise<ScreenerUniverseCoin[]> {
  const [coingecko, binanceSymbols] = await Promise.all([
    fetchCoinGeckoTop(topN * 2),
    fetchBinanceFuturesSymbols(),
  ]);

  const validated: ScreenerUniverseCoin[] = [];
  for (const coin of coingecko) {
    const symbol = `${coin.symbol.toUpperCase()}USDT`;
    if (binanceSymbols.has(symbol)) {
      validated.push({
        symbol,
        baseAsset: coin.symbol.toUpperCase(),
        quoteAsset: 'USDT',
        marketCapRank: coin.market_cap_rank ?? validated.length + 1,
      });
    }
    if (validated.length >= topN) break;
  }
  return validated;
}

interface CoinGeckoCoin {
  id: string;
  symbol: string;
  name: string;
  market_cap_rank: number | null;
}

async function fetchCoinGeckoTop(limit: number): Promise<CoinGeckoCoin[]> {
  const res = await fetch(`${COINGECKO_TOP_MARKETS_URL}&per_page=${limit}`, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`coingecko_status_${res.status}`);
  const data = (await res.json()) as CoinGeckoCoin[];
  if (!Array.isArray(data)) throw new Error('coingecko_invalid_payload');
  return data.filter((c) => typeof c.symbol === 'string' && c.symbol.length > 0);
}

async function fetchBinanceFuturesSymbols(): Promise<Set<string>> {
  const res = await fetch(BINANCE_FUTURES_EXCHANGE_INFO_URL, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`binance_futures_status_${res.status}`);
  const data = (await res.json()) as { symbols?: Array<{ symbol: string; status: string; quoteAsset: string }> };
  const set = new Set<string>();
  for (const s of data.symbols ?? []) {
    if (s.status === 'TRADING' && s.quoteAsset === 'USDT') set.add(s.symbol);
  }
  return set;
}

function fallback(now: number, reason: string): DynamicUniverseResult {
  return {
    source: 'fallback_static',
    coins: getDefaultUniverse(),
    fetchedAt: now,
    fallbackReason: reason,
  };
}

async function readCache(file: string): Promise<CachedUniverse | null> {
  try {
    const raw = await fs.readFile(file, 'utf8');
    const parsed = JSON.parse(raw) as CachedUniverse;
    if (!Array.isArray(parsed.coins)) return null;
    return parsed;
  } catch {
    return null;
  }
}

async function writeCache(file: string, payload: CachedUniverse): Promise<void> {
  try {
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, JSON.stringify(payload, null, 2), 'utf8');
  } catch {
    // Cache write failure is non-fatal.
  }
}
