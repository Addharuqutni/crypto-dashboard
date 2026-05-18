import type { BacktestTrade } from './types';

/**
 * Equity-curve helpers.
 *
 * The historical backtest UI charts cumulative R across trades to make
 * drawdowns and streaks visually obvious. We keep the projection in a
 * dedicated module so:
 *   - the simulator/metrics modules stay free of presentation concerns
 *   - the projection is unit-testable in isolation
 *   - the chart component only needs a flat numeric series
 *
 * Trades are assumed to already be in chronological order (the simulator
 * preserves caller order, and the runner walks bars forward), so we do not
 * re-sort; doing so would corrupt the streak/drawdown semantics.
 */

export interface EquityPoint {
  /** 1-based trade index. Index 0 represents the starting balance (0R). */
  index: number;
  /** Cumulative R at this point. */
  cumulativeR: number;
  /** R for this trade only (0 for the seed point). */
  tradeR: number;
  /** Running peak across the curve, used to derive drawdown. */
  peakR: number;
  /** Drawdown from the running peak (peakR - cumulativeR), always ≥ 0. */
  drawdownR: number;
}

/**
 * Project trades onto a cumulative-R equity curve.
 *
 * Always emits an explicit seed point at index 0 / 0R so the chart has a
 * defined origin even when there are no trades.
 */
export function projectEquityCurve(trades: BacktestTrade[]): EquityPoint[] {
  const out: EquityPoint[] = [
    { index: 0, cumulativeR: 0, tradeR: 0, peakR: 0, drawdownR: 0 },
  ];

  let cum = 0;
  let peak = 0;

  trades.forEach((trade, i) => {
    cum += trade.finalR;
    if (cum > peak) peak = cum;
    out.push({
      index: i + 1,
      cumulativeR: round(cum, 4),
      tradeR: round(trade.finalR, 4),
      peakR: round(peak, 4),
      drawdownR: round(peak - cum, 4),
    });
  });

  return out;
}

function round(v: number, digits: number): number {
  if (!Number.isFinite(v)) return v;
  const m = Math.pow(10, digits);
  return Math.round(v * m) / m;
}
