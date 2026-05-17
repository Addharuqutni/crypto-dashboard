import type { Candle } from '@/types/chart';
import {
  DEFAULT_BACKTEST_CONFIG,
  type BacktestConfig,
  type BacktestRunInput,
  type BacktestSignal,
  type BacktestTrade,
  type BacktestTradeStatus,
} from './types';

/**
 * Bar-by-bar backtest simulator.
 *
 * Why bar-by-bar (and not signal-by-signal):
 *   - We must resolve same-bar SL+TP touches with a defensible rule.
 *   - We need MFE/MAE measured against every bar in the holding window.
 *   - Forced expiry must use the same time axis as fills.
 *
 * Conservatism: when intrabar high/low straddle both SL and TP1 on the same
 * bar, the configurable `preferStopOnConflict` flag (default true) makes SL
 * win. This keeps backtests honest about worst-plausible execution.
 */

export function simulateTrades(input: BacktestRunInput): BacktestTrade[] {
  const cfg: BacktestConfig = mergeConfig(input.config);
  const trades: BacktestTrade[] = [];
  for (const signal of input.signals) {
    if (signal.action !== 'LONG' && signal.action !== 'SHORT') continue;
    const trade = simulateOneTrade(signal, input.candles, cfg);
    if (trade) trades.push(trade);
  }
  return trades;
}

function mergeConfig(partial?: Partial<BacktestConfig>): BacktestConfig {
  if (!partial) return DEFAULT_BACKTEST_CONFIG;
  return {
    ...DEFAULT_BACKTEST_CONFIG,
    ...partial,
    costs: { ...DEFAULT_BACKTEST_CONFIG.costs, ...(partial.costs ?? {}) },
  };
}

/**
 * Simulate a single trade. Returns `null` when the signal is missing the
 * minimum data needed (entry + SL) — those signals just become non-trades and
 * inflate the wait-rate denominator.
 */
function simulateOneTrade(
  signal: BacktestSignal,
  candles: Candle[],
  cfg: BacktestConfig
): BacktestTrade | null {
  if (signal.entry == null || signal.stopLoss == null) return null;
  const opening = candles[signal.barIndex];
  if (!opening) return null;

  const isLong = signal.action === 'LONG';
  const stop = signal.stopLoss;
  const entry = signal.entry;
  const rDist = Math.abs(entry - stop);
  if (rDist <= 0) return null; // degenerate: zero risk distance

  // Round-trip cost in price units, applied symmetrically as slippage on
  // entry + exit and a taker fee per side. Funding is amortised over the
  // holding period.
  const slippage = entry * cfg.costs.slippage;
  const taker = entry * cfg.costs.takerFee;
  const entryFill = isLong ? entry + slippage : entry - slippage;

  // Walk forward bar-by-bar.
  let status: BacktestTradeStatus = 'PENDING';
  let exitFill: number | null = null;
  let closeBarIndex = signal.barIndex;
  let mfePrice = 0;
  let maePrice = 0;

  const maxBar = Math.min(candles.length - 1, signal.barIndex + cfg.maxHoldCandles);
  let lastBar: Candle | null = null;

  for (let i = signal.barIndex + 1; i <= maxBar; i++) {
    const bar = candles[i];
    if (!bar) break;
    lastBar = bar;

    // Track excursions in price units relative to entry.
    const favorable = isLong ? bar.high - entryFill : entryFill - bar.low;
    const adverse = isLong ? entryFill - bar.low : bar.high - entryFill;
    if (favorable > mfePrice) mfePrice = favorable;
    if (adverse > maePrice) maePrice = adverse;

    // Resolve intrabar fills.
    if (cfg.intrabarFills) {
      const slHit = isLong ? bar.low <= stop : bar.high >= stop;
      const tp1Hit = signal.tp1 != null && (isLong ? bar.high >= signal.tp1 : bar.low <= signal.tp1);
      const tp2Hit = signal.tp2 != null && (isLong ? bar.high >= signal.tp2 : bar.low <= signal.tp2);
      const tp3Hit = signal.tp3 != null && (isLong ? bar.high >= signal.tp3 : bar.low <= signal.tp3);

      // Conservative same-bar conflict: prefer SL.
      if (slHit && (tp1Hit || tp2Hit || tp3Hit) && cfg.preferStopOnConflict) {
        status = 'SL';
        exitFill = stop;
        closeBarIndex = i;
        break;
      }
      if (slHit) {
        status = 'SL';
        exitFill = stop;
        closeBarIndex = i;
        break;
      }
      if (tp3Hit && signal.tp3 != null) {
        status = 'TP3';
        exitFill = signal.tp3;
        closeBarIndex = i;
        break;
      }
      if (tp2Hit && signal.tp2 != null) {
        status = 'TP2';
        exitFill = signal.tp2;
        closeBarIndex = i;
        break;
      }
      if (tp1Hit && signal.tp1 != null) {
        status = 'TP1';
        exitFill = signal.tp1;
        closeBarIndex = i;
        break;
      }
    } else {
      // Close-by-close path: only the close decides.
      const slHit = isLong ? bar.close <= stop : bar.close >= stop;
      if (slHit) {
        status = 'SL';
        exitFill = bar.close;
        closeBarIndex = i;
        break;
      }
      if (signal.tp3 != null && (isLong ? bar.close >= signal.tp3 : bar.close <= signal.tp3)) {
        status = 'TP3';
        exitFill = bar.close;
        closeBarIndex = i;
        break;
      }
      if (signal.tp2 != null && (isLong ? bar.close >= signal.tp2 : bar.close <= signal.tp2)) {
        status = 'TP2';
        exitFill = bar.close;
        closeBarIndex = i;
        break;
      }
      if (signal.tp1 != null && (isLong ? bar.close >= signal.tp1 : bar.close <= signal.tp1)) {
        status = 'TP1';
        exitFill = bar.close;
        closeBarIndex = i;
        break;
      }
    }
  }

  // Forced expiry: hold expired and trade is still open.
  if (status === 'PENDING') {
    status = 'EXPIRED';
    closeBarIndex = maxBar;
    exitFill = lastBar ? lastBar.close : null;
  }

  // Final fills with exit-side slippage.
  const exitFillFinal =
    exitFill == null
      ? null
      : isLong
        ? exitFill - entry * cfg.costs.slippage
        : exitFill + entry * cfg.costs.slippage;

  // Funding placeholder amortised over heldBars.
  const heldBars = closeBarIndex - signal.barIndex;
  const fundingPerCandle = (cfg.costs.fundingCost ?? 0) / Math.max(1, cfg.costs.fundingIntervalCandles ?? 16);
  const fundingPriceCost = entry * fundingPerCandle * heldBars;

  // PnL in price, then convert to R.
  let pnlPrice = 0;
  if (exitFillFinal != null) {
    pnlPrice = isLong ? exitFillFinal - entryFill : entryFill - exitFillFinal;
  }
  // Subtract round-trip costs (taker fee both sides + funding amortisation).
  const totalCostPrice = taker * 2 + fundingPriceCost;
  const netPriceR = (pnlPrice - totalCostPrice) / rDist;
  const costR = totalCostPrice / rDist;

  return {
    id: `${signal.symbol}-${signal.barIndex}`,
    signal,
    status,
    openBarIndex: signal.barIndex,
    closeBarIndex,
    entryFill,
    exitFill: exitFillFinal,
    heldBars,
    finalR: round(netPriceR, 4),
    mfeR: round(mfePrice / rDist, 4),
    maeR: round(maePrice / rDist, 4),
    costR: round(costR, 4),
    reasons: [],
    warnings: [],
  };
}

function round(v: number, digits: number): number {
  const m = Math.pow(10, digits);
  return Math.round(v * m) / m;
}
