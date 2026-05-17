import type { Candle } from '@/types/chart';
import { generateFuturesSignal } from '@/lib/analysis/futures-signal-engine';
import type {
  FuturesSignalConfig,
  FuturesSignalInput,
} from '@/types/futures-signal';
import { simulateTrades } from './simulator';
import { computeMetrics, deriveSampleWarnings } from './metrics';
import type {
  BacktestConfig,
  BacktestResult,
  BacktestSignal,
} from './types';

/**
 * Walk a candle series with the live signal engine and run the simulator on
 * the resulting signals.
 *
 * Methodology:
 *   1. Iterate from `warmupBars` onward, slicing setup/macro/trigger candles
 *      so the engine never "sees" future bars.
 *   2. The macro slice is downsampled to a 4H rhythm by sampling every Nth
 *      candle; the trigger slice is the most recent N candles assumed to be
 *      the same TF as the setup. This is a deliberate simplification — full
 *      multi-stream replay is out of scope for Phase 2.
 *   3. WAITs are recorded but produce no trades (and inflate `waitRate`).
 *   4. The simulator handles fills, MFE/MAE, fees, slippage, and expiry.
 *
 * Determinism: `nowMs` is pinned to the current bar's `closeTime`, so the
 * data-health gate's freshness check stays stable across runs.
 */

export interface RunBacktestInput {
  symbol: string;
  timeframe: string;
  /** Setup-TF candles. Macro/trigger slices are derived from this series. */
  candles: Candle[];
  /**
   * Optional independent macro candles. When omitted the runner downsamples
   * `candles` to approximate a higher TF — useful for fixture testing but
   * not a substitute for real multi-TF data on production runs.
   */
  macroCandles?: Candle[];
  triggerCandles?: Candle[];
  /** Bars to skip before signalling. Defaults to 220 (engine needs EMA200). */
  warmupBars?: number;
  /** Optional override for the engine's config. */
  engineConfig?: FuturesSignalConfig;
  /** Optional override for the simulator's config. */
  backtestConfig?: Partial<BacktestConfig>;
}

export function runBacktest(input: RunBacktestInput): BacktestResult {
  const warmup = input.warmupBars ?? 220;
  const all = input.candles;
  const signals: BacktestSignal[] = [];
  if (all.length <= warmup + 5) {
    return emptyResult();
  }

  for (let i = warmup; i < all.length; i++) {
    const setupSlice = all.slice(0, i + 1);
    const macroSlice = input.macroCandles
      ? sliceByCloseTime(input.macroCandles, all[i]?.closeTime ?? 0)
      : downsample(setupSlice, 8);
    const triggerSlice = input.triggerCandles
      ? sliceByCloseTime(input.triggerCandles, all[i]?.closeTime ?? 0)
      : setupSlice.slice(-Math.min(setupSlice.length, 60));

    const engineInput: FuturesSignalInput = {
      symbol: input.symbol,
      timeframe: input.timeframe,
      candles: setupSlice,
      macroCandles: macroSlice,
      triggerCandles: triggerSlice,
      nowMs: all[i]?.closeTime ?? Date.now(),
    };

    const signal = input.engineConfig
      ? generateFuturesSignal(engineInput, input.engineConfig)
      : generateFuturesSignal(engineInput);

    if (signal.action === 'WAIT') {
      // Still record a WAIT for waitRate accounting; not converted to a trade.
      signals.push({
        barIndex: i,
        symbol: input.symbol,
        timeframe: input.timeframe,
        action: 'WAIT',
        marketRegime: signal.marketRegime,
        tradePermission: signal.tradePermission,
        setupType: signal.entryTrigger,
        confidence: signal.confidence,
        grade: signal.grade,
        signalGrade: signal.signalGrade,
        entry: null,
        stopLoss: null,
        tp1: null,
        tp2: null,
        tp3: null,
        riskRewardRatio: null,
      });
      continue;
    }

    // For LONG/SHORT, only record signals with a complete plan.
    if (signal.entryZone.min == null || signal.stopLoss == null) continue;

    signals.push({
      barIndex: i,
      symbol: input.symbol,
      timeframe: input.timeframe,
      action: signal.action,
      marketRegime: signal.marketRegime,
      tradePermission: signal.tradePermission,
      setupType: signal.entryTrigger,
      confidence: signal.confidence,
      grade: signal.grade,
      signalGrade: signal.signalGrade,
      entry: signal.entryZone.min,
      stopLoss: signal.stopLoss,
      tp1: signal.takeProfits.tp1,
      tp2: signal.takeProfits.tp2,
      tp3: signal.takeProfits.tp3,
      riskRewardRatio: signal.riskRewardRatio,
    });
  }

  const trades = simulateTrades({
    symbol: input.symbol,
    timeframe: input.timeframe,
    candles: all,
    signals,
    ...(input.backtestConfig ? { config: input.backtestConfig } : {}),
  });

  const metrics = computeMetrics(signals, trades);
  const warnings = deriveSampleWarnings(metrics);

  return { trades, metrics, warnings };
}

/**
 * Approximate a higher timeframe by taking every Nth candle from the setup
 * slice. Used only when the caller has not supplied real macro candles.
 */
function downsample(candles: Candle[], stride: number): Candle[] {
  if (stride <= 1) return candles;
  const out: Candle[] = [];
  for (let i = 0; i < candles.length; i += stride) {
    const end = Math.min(i + stride - 1, candles.length - 1);
    const first = candles[i];
    const last = candles[end];
    if (!first || !last) continue;
    let high = first.high;
    let low = first.low;
    let volume = 0;
    for (let j = i; j <= end; j++) {
      const c = candles[j];
      if (!c) continue;
      if (c.high > high) high = c.high;
      if (c.low < low) low = c.low;
      volume += c.volume;
    }
    out.push({
      symbol: first.symbol,
      binanceSymbol: first.binanceSymbol,
      openTime: first.openTime,
      open: first.open,
      high,
      low,
      close: last.close,
      volume,
      closeTime: last.closeTime,
    });
  }
  return out;
}

/**
 * Cut an external macro/trigger series so the engine never sees candles
 * closing after the current setup bar.
 */
function sliceByCloseTime(series: Candle[], asOfMs: number): Candle[] {
  if (asOfMs <= 0) return series;
  const idx = lastIndexLE(series, asOfMs);
  if (idx < 0) return [];
  return series.slice(0, idx + 1);
}

function lastIndexLE(series: Candle[], asOfMs: number): number {
  let lo = 0;
  let hi = series.length - 1;
  let best = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const candle = series[mid];
    if (!candle) break;
    if (candle.closeTime <= asOfMs) {
      best = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return best;
}

function emptyResult(): BacktestResult {
  return {
    trades: [],
    metrics: {
      totalSignals: 0,
      totalTrades: 0,
      waitRate: 0,
      winRate: 0,
      lossRate: 0,
      averageR: 0,
      expectancyR: 0,
      profitFactor: 0,
      maxDrawdownR: 0,
      maxLosingStreak: 0,
      averageHoldCandles: 0,
      bestSetupType: null,
      worstSetupType: null,
      performanceByRegime: {},
      performanceByTimeframe: {},
      performanceBySymbol: {},
    },
    warnings: ['Series too short to backtest. Provide more candles than the warmup window.'],
  };
}
