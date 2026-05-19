import type {
  BacktestMetrics,
  BacktestPerformanceBucket,
  BacktestSignal,
  BacktestTrade,
} from './types';
import type { FuturesEntryTrigger } from '@/types/futures-signal';

/**
 * Compute aggregate Phase 2 metrics from a list of trades and the original
 * signals (the latter is needed for `waitRate`).
 *
 * The function is pure and deterministic — `trades` need not be sorted but
 * order matters for `maxDrawdownR` and `maxLosingStreak`, so we keep the
 * caller's order intact.
 */
export function computeMetrics(
  signals: BacktestSignal[],
  trades: BacktestTrade[]
): BacktestMetrics {
  const totalSignals = signals.length;
  const waitCount = signals.filter((s) => s.action === 'WAIT').length;
  const totalTrades = trades.length;

  if (totalTrades === 0) {
    return {
      totalSignals,
      totalTrades: 0,
      waitRate: totalSignals > 0 ? (waitCount / totalSignals) * 100 : 0,
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
    };
  }

  const wins = trades.filter((t) => t.finalR > 0);
  const losses = trades.filter((t) => t.finalR <= 0);
  const winRate = (wins.length / totalTrades) * 100;
  const lossRate = (losses.length / totalTrades) * 100;
  const sumR = trades.reduce((s, t) => s + t.finalR, 0);
  const averageR = sumR / totalTrades;
  const sumWinR = wins.reduce((s, t) => s + t.finalR, 0);
  const sumLossR = losses.reduce((s, t) => s + t.finalR, 0);
  const avgWinR = wins.length > 0 ? sumWinR / wins.length : 0;
  const avgLossR = losses.length > 0 ? sumLossR / losses.length : 0;
  const expectancyR = (winRate / 100) * avgWinR + (lossRate / 100) * avgLossR;
  const profitFactor = sumLossR === 0 ? (sumWinR > 0 ? Infinity : 0) : sumWinR / Math.abs(sumLossR);

  // Drawdown is computed across the realised cumulative-R equity curve.
  let peak = 0;
  let cum = 0;
  let maxDrawdownR = 0;
  let losingStreak = 0;
  let maxLosingStreak = 0;
  for (const t of trades) {
    cum += t.finalR;
    if (cum > peak) peak = cum;
    const dd = peak - cum;
    if (dd > maxDrawdownR) maxDrawdownR = dd;
    if (t.finalR <= 0) {
      losingStreak += 1;
      if (losingStreak > maxLosingStreak) maxLosingStreak = losingStreak;
    } else {
      losingStreak = 0;
    }
  }

  const averageHoldCandles =
    trades.reduce((s, t) => s + t.heldBars, 0) / totalTrades;

  // Setup-type ranking: best/worst by average-R (only setups with ≥2 samples
  // qualify so a single 5R fluke can't win).
  const setupBuckets = bucketBy(trades, (t) => t.signal.setupType);
  const ranked = Object.entries(setupBuckets)
    .filter(([, b]) => b.count >= 2)
    .sort((a, b) => b[1].averageR - a[1].averageR);

  const bestSetupType = ranked.length > 0 ? (ranked[0]?.[0] as FuturesEntryTrigger) : null;
  const worstSetupType =
    ranked.length > 0 ? (ranked[ranked.length - 1]?.[0] as FuturesEntryTrigger) : null;

  return {
    totalSignals,
    totalTrades,
    waitRate: totalSignals > 0 ? (waitCount / totalSignals) * 100 : 0,
    winRate: round(winRate, 2),
    lossRate: round(lossRate, 2),
    averageR: round(averageR, 4),
    expectancyR: round(expectancyR, 4),
    profitFactor: profitFactor === Infinity ? Infinity : round(profitFactor, 2),
    maxDrawdownR: round(maxDrawdownR, 4),
    maxLosingStreak,
    averageHoldCandles: round(averageHoldCandles, 2),
    bestSetupType,
    worstSetupType,
    performanceByRegime: bucketBy(trades, (t) => t.signal.marketRegime),
    performanceByTimeframe: bucketBy(trades, (t) => t.signal.timeframe),
    performanceBySymbol: bucketBy(trades, (t) => t.signal.symbol),
  };
}

/**
 * Group trades by an arbitrary key and compute the per-bucket performance
 * snapshot. `null`/`undefined` keys collapse to the literal "unknown" string.
 */
function bucketBy(
  trades: BacktestTrade[],
  keyFn: (t: BacktestTrade) => string | undefined | null
): Record<string, BacktestPerformanceBucket> {
  const buckets: Record<string, BacktestPerformanceBucket> = {};
  for (const t of trades) {
    const k = keyFn(t) ?? 'unknown';
    const b = buckets[k] ?? {
      count: 0,
      wins: 0,
      losses: 0,
      totalR: 0,
      averageR: 0,
      winRate: 0,
    };
    b.count += 1;
    if (t.finalR > 0) b.wins += 1;
    else b.losses += 1;
    b.totalR += t.finalR;
    buckets[k] = b;
  }
  for (const k of Object.keys(buckets)) {
    const b = buckets[k];
    if (!b) continue;
    b.averageR = b.count > 0 ? round(b.totalR / b.count, 4) : 0;
    b.winRate = b.count > 0 ? round((b.wins / b.count) * 100, 2) : 0;
    b.totalR = round(b.totalR, 4);
  }
  return buckets;
}

/**
 * Sample-size and viability warnings. Mirrors the Phase 2 spec exactly so the
 * UI can render them as-is.
 */
export function deriveSampleWarnings(metrics: BacktestMetrics): string[] {
  const out: string[] = [];
  if (metrics.totalTrades < 30) {
    out.push('Insufficient sample (<30 trades). Treat results as exploratory.');
  } else if (metrics.totalTrades < 100) {
    out.push('Weak confidence (<100 trades). More data is needed for a verdict.');
  }
  if (metrics.maxDrawdownR >= 8) {
    out.push(
      `High drawdown (${metrics.maxDrawdownR.toFixed(2)}R). Position sizing must account for streaks.`
    );
  }
  if (metrics.expectancyR <= 0) {
    out.push('Expectancy ≤ 0R. Engine is not tradable as-is — do NOT deploy live.');
  }
  if (metrics.profitFactor !== Infinity && metrics.profitFactor < 1) {
    out.push('Profit factor below 1.0 — net negative across closed trades.');
  }
  return out;
}

function round(v: number, digits: number): number {
  if (!Number.isFinite(v)) return v;
  const m = Math.pow(10, digits);
  return Math.round(v * m) / m;
}
