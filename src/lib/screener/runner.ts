import type { Candle } from '@/types/chart';
import type { FuturesSignal, FuturesSignalInput } from '@/types/futures-signal';
import { generateFuturesSignal } from '@/lib/analysis/futures-signal-engine';
import { fetchKlines } from '@/lib/worker/binance';
import type {
  ScreenerConfig,
  ScreenerHealth,
  ScreenerResult,
  ScreenerUniverseCoin,
} from './types';

/**
 * Screener runner — evaluates every symbol in the configured universe using
 * the canonical deterministic signal engine. No AI, no alert sending, no
 * duplicate trading logic.
 *
 * Design:
 *   - One symbol failure never aborts the whole run.
 *   - Stale/missing data produces WAIT (the engine already handles this).
 *   - Concurrency is bounded by `config.maxConcurrentSymbols`.
 *   - The runner is pure data-in/data-out; persistence is the caller's job.
 */

export interface ScreenerRunnerDeps {
  fetchKlinesFn?: typeof fetchKlines;
  generateSignalFn?: typeof generateFuturesSignal;
  now?: () => number;
}

export interface ScreenerRunResult {
  results: ScreenerResult[];
  health: ScreenerHealth;
}

/**
 * Run a single screener evaluation cycle across the configured universe.
 * Returns normalized results for every symbol (including WAIT outcomes).
 */
export async function runScreenerCycle(
  config: ScreenerConfig,
  deps: ScreenerRunnerDeps = {}
): Promise<ScreenerRunResult> {
  const fetchKlinesImpl = deps.fetchKlinesFn ?? fetchKlines;
  const engine = deps.generateSignalFn ?? generateFuturesSignal;
  const now = deps.now ?? Date.now;

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
      batch.map((coin) => evaluateSymbol(coin, config, fetchKlinesImpl, engine, now))
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
 * Evaluate a single symbol: fetch candles → run engine → normalize output.
 */
async function evaluateSymbol(
  coin: ScreenerUniverseCoin,
  config: ScreenerConfig,
  fetcher: typeof fetchKlines,
  engine: typeof generateFuturesSignal,
  now: () => number
): Promise<ScreenerResult> {
  const [setupCandles, macroCandles, triggerCandles] = await Promise.all([
    fetcher({ binanceSymbol: coin.symbol, interval: config.setupTimeframe, limit: config.candleLimit }),
    fetcher({ binanceSymbol: coin.symbol, interval: config.macroTimeframe, limit: config.candleLimit }),
    fetcher({ binanceSymbol: coin.symbol, interval: config.triggerTimeframe, limit: config.candleLimit }),
  ]);

  // Pin nowMs to the last setup candle's close for deterministic freshness.
  const lastSetup = setupCandles[setupCandles.length - 1];
  const nowMs = lastSetup ? lastSetup.closeTime : now();

  const engineInput: FuturesSignalInput = {
    symbol: coin.symbol,
    timeframe: config.setupTimeframe,
    candles: setupCandles,
    macroCandles,
    triggerCandles,
    nowMs,
  };

  const signal = engine(engineInput);

  return normalizeResult(coin, config, signal, setupCandles, now());
}

/**
 * Map the engine's FuturesSignal into the flat ScreenerResult shape.
 * Never fabricates entry/SL/TP — passes through engine output as-is.
 */
function normalizeResult(
  coin: ScreenerUniverseCoin,
  config: ScreenerConfig,
  signal: FuturesSignal,
  setupCandles: Candle[],
  evaluatedAt: number
): ScreenerResult {
  const lastCandle = setupCandles[setupCandles.length - 1];

  return {
    symbol: coin.symbol,
    baseAsset: coin.baseAsset,
    quoteAsset: coin.quoteAsset,
    marketCapRank: coin.marketCapRank,
    setupTimeframe: config.setupTimeframe,
    triggerTimeframe: config.triggerTimeframe,
    macroTimeframe: config.macroTimeframe,
    evaluatedAt,
    candleCloseTime: lastCandle?.closeTime ?? null,
    dataHealth: signal.dataHealth,
    action: signal.action,
    confidence: signal.confidence ?? signal.confidenceScore ?? 0,
    grade: signal.grade ?? 'D',
    entry: signal.entryZone?.min ?? null,
    stopLoss: signal.stopLoss ?? null,
    takeProfits: [
      signal.takeProfits?.tp1 ?? null,
      signal.takeProfits?.tp2 ?? null,
      signal.takeProfits?.tp3 ?? null,
    ],
    riskReward: signal.riskRewardRatio ?? null,
    marketRegime: signal.marketRegime ?? 'unknown',
    tradePermission: signal.tradePermission ?? 'no_trade',
    reasons: signal.reasons ?? [],
    noTradeReasons: signal.noTradeReasons ?? [],
    fundingRate: signal.positioning?.fundingRate ?? null,
    openInterestChangePercent: signal.positioning?.openInterestChangePercent ?? null,
    mtfAlignmentScore: signal.mtfConfirmation?.alignmentScore ?? null,
    warnings: signal.warnings ?? [],
  };
}

/** Safely truncate error messages for health reporting. */
function truncateMessage(err: unknown, max = 300): string {
  const msg = err instanceof Error ? err.message : String(err);
  return msg.length <= max ? msg : `${msg.slice(0, max)}...`;
}
