import type { Candle } from '@/types/chart';
import type { FuturesSignalInput } from '@/types/futures-signal';
import { generateFuturesSignal } from '@/lib/domain/analysis/futures-signal-engine';
import { fetchKlines } from '@/lib/adapters/binance';
import { fetchFundingRate } from '@/lib/adapters/api/binance-funding-rate';
import { fetchOpenInterestSnapshot } from '@/lib/adapters/api/binance-open-interest';
import type {
  ScreenerConfig,
  ScreenerHealth,
  ScreenerResult,
  ScreenerUniverseCoin,
} from '../types';
import type { ScreenerCyclePorts } from '../ports';
import { normalizeResult } from '../mappers/normalize-result';

/**
 * Run-Screener-Cycle use case.
 *
 * Orchestrates a single read-only ranking pass across the configured
 * universe. The use case is responsible for:
 *   - resolving ports (fetchers, signal engine, clock)
 *   - bounded-concurrency batching of per-symbol evaluation
 *   - tolerating partial failures (one bad symbol never aborts the run)
 *   - assembling a `ScreenerHealth` snapshot for observability
 *
 * Persistence and ranking are NOT this layer's job — they belong to the
 * scheduler / store / ranker consumers above this use case.
 *
 * Hexagonal-architecture intent:
 *   - All I/O dependencies are passed in as ports (`ScreenerCyclePorts`).
 *   - Defaults are wired here so the production composition root can call
 *     `runScreenerCycle(cfg)` without thinking about plumbing.
 *   - Tests can inject mocks for any subset of ports.
 */

export interface ScreenerRunResult {
  results: ScreenerResult[];
  health: ScreenerHealth;
}

/**
 * Execute a single screener evaluation cycle across the configured universe.
 * Returns normalized results for every symbol (including WAIT outcomes).
 *
 * Backwards-compat note: this function used to live in `lib/screener/runner.ts`
 * with a `ScreenerRunnerDeps` argument. The shape is preserved so existing
 * callers (`scripts/screener/start.ts`, `lib/screener/scheduler.ts`) keep
 * working without modification.
 */
export async function runScreenerCycle(
  config: ScreenerConfig,
  ports: ScreenerCyclePorts = {}
): Promise<ScreenerRunResult> {
  const fetchKlinesImpl = ports.fetchKlines ?? fetchKlines;
  const fetchFundingImpl = ports.fetchFundingRate ?? fetchFundingRate;
  const fetchOiImpl = ports.fetchOpenInterest ?? fetchOpenInterestSnapshot;
  const engine = ports.signalEngine ?? generateFuturesSignal;
  const now = ports.now ?? Date.now;

  const health: ScreenerHealth = {
    status: 'running',
    startedAt: now(),
    completedAt: null,
    evaluatedSymbols: 0,
    failedSymbols: 0,
    errors: [],
  };

  const results: ScreenerResult[] = [];
  const symbols = config.symbols;

  // Process symbols in batches to respect maxConcurrentSymbols.
  for (let i = 0; i < symbols.length; i += config.maxConcurrentSymbols) {
    const batch = symbols.slice(i, i + config.maxConcurrentSymbols);
    const batchResults = await Promise.allSettled(
      batch.map((coin) =>
        evaluateSymbol(coin, config, fetchKlinesImpl, fetchFundingImpl, fetchOiImpl, engine, now)
      )
    );

    for (const [j, settled] of batchResults.entries()) {
      const coin = batch[j];
      if (!coin) continue;

      if (settled.status === 'fulfilled') {
        results.push(settled.value);
        health.evaluatedSymbols += 1;
      } else {
        health.failedSymbols += 1;
        health.errors.push({
          symbol: coin.symbol,
          message: truncateMessage(settled.reason),
        });
      }
    }
  }

  health.completedAt = now();
  health.status =
    health.failedSymbols === 0
      ? 'completed'
      : health.evaluatedSymbols === 0
        ? 'failed'
        : 'completed_with_errors';

  return { results, health };
}

/**
 * Evaluate a single symbol: fetch candles + funding + OI → run engine →
 * normalize output. Funding/OI failures produce warnings but never fail
 * the symbol — the engine already handles missing positioning data.
 */
async function evaluateSymbol(
  coin: ScreenerUniverseCoin,
  config: ScreenerConfig,
  fetchKlinesImpl: typeof fetchKlines,
  fetchFundingImpl: typeof fetchFundingRate,
  fetchOiImpl: typeof fetchOpenInterestSnapshot,
  engine: typeof generateFuturesSignal,
  now: () => number
): Promise<ScreenerResult> {
  // Fetch all market data concurrently. Klines failure is fatal for the
  // symbol; funding/OI failures produce warnings only.
  const [setupSettled, macroSettled, triggerSettled, fundingSettled, oiSettled] =
    await Promise.allSettled([
      fetchKlinesImpl({ binanceSymbol: coin.symbol, interval: config.setupTimeframe, limit: config.candleLimit }),
      fetchKlinesImpl({ binanceSymbol: coin.symbol, interval: config.macroTimeframe, limit: config.candleLimit }),
      fetchKlinesImpl({ binanceSymbol: coin.symbol, interval: config.triggerTimeframe, limit: config.candleLimit }),
      fetchFundingImpl(coin.symbol),
      fetchOiImpl(coin.symbol),
    ]);

  // Klines are critical — propagate failures so the runner can record them.
  const setupCandles = unwrapKlines(setupSettled, coin.symbol, config.setupTimeframe);
  const macroCandles = unwrapKlines(macroSettled, coin.symbol, config.macroTimeframe);
  const triggerCandles = unwrapKlines(triggerSettled, coin.symbol, config.triggerTimeframe);

  // Funding/OI are non-critical — collect warnings on failure.
  const warnings: string[] = [];

  let fundingRate: number | null = null;
  let fundingRateUpdatedAtMs: number | null = null;
  if (fundingSettled.status === 'fulfilled' && fundingSettled.value) {
    fundingRate = fundingSettled.value.lastFundingRate;
    fundingRateUpdatedAtMs = now();
  } else {
    warnings.push('funding_unavailable');
  }

  let openInterestChangePercent: number | null = null;
  let openInterestUpdatedAtMs: number | null = null;
  if (oiSettled.status === 'fulfilled' && oiSettled.value) {
    openInterestChangePercent = oiSettled.value.changePercent;
    openInterestUpdatedAtMs = now();
  } else {
    warnings.push('open_interest_unavailable');
  }

  // Pin nowMs to the last setup candle's close for deterministic freshness.
  const lastSetup = setupCandles[setupCandles.length - 1];
  const nowMs = lastSetup ? lastSetup.closeTime : now();

  const engineInput: FuturesSignalInput = {
    symbol: coin.symbol,
    timeframe: config.setupTimeframe,
    candles: setupCandles,
    macroCandles,
    triggerCandles,
    fundingRate,
    fundingRateUpdatedAtMs,
    openInterestChangePercent,
    openInterestUpdatedAtMs,
    nowMs,
  };

  const signal = engine(engineInput);

  return normalizeResult({
    coin,
    config,
    signal,
    setupCandles,
    macroCandles,
    triggerCandles,
    runnerWarnings: warnings,
    evaluatedAt: now(),
  });
}

/**
 * Unwrap a klines fetch result. Klines are critical so failures throw.
 */
function unwrapKlines(
  settled: PromiseSettledResult<Candle[]>,
  symbol: string,
  interval: string
): Candle[] {
  if (settled.status === 'fulfilled') {
    return settled.value;
  }
  const reason = settled.reason instanceof Error ? settled.reason.message : String(settled.reason);
  throw new Error(`klines fetch failed for ${symbol} ${interval}: ${reason}`);
}

/** Safely truncate error messages for health reporting. */
function truncateMessage(err: unknown, max = 300): string {
  const msg = err instanceof Error ? err.message : String(err);
  return msg.length <= max ? msg : `${msg.slice(0, max)}...`;
}
