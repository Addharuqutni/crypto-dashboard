import { describe, expect, it } from 'vitest';
import { projectEquityCurve } from '../equity-curve';
import type { BacktestTrade } from '../types';

/**
 * Equity curve projection tests.
 *
 * The projection is small but it underpins the chart, drawdown highlighting,
 * and any future per-trade analytics. We verify:
 *   - origin point is always emitted
 *   - cumulative R matches the running sum
 *   - peak/drawdown semantics match the metrics module
 *   - drawdown is never negative (peak monotonically non-decreasing)
 */

function trade(finalR: number, idx = 0): BacktestTrade {
  return {
    id: `T-${idx}-${finalR}`,
    signal: {
      barIndex: idx,
      symbol: 'TEST',
      timeframe: '30m',
      action: 'LONG',
      marketRegime: 'bullish_trend',
      tradePermission: 'long_only',
      setupType: 'BREAKOUT',
      confidence: 70,
      grade: 'A',
      entry: 100,
      stopLoss: 95,
      tp1: 105,
      tp2: 110,
      tp3: 115,
    },
    status: finalR > 0 ? 'TP2' : 'SL',
    openBarIndex: idx,
    closeBarIndex: idx + 5,
    entryFill: 100,
    exitFill: finalR > 0 ? 110 : 95,
    heldBars: 5,
    finalR,
    mfeR: Math.max(0, finalR),
    maeR: Math.max(0, -finalR),
    costR: 0.05,
    reasons: [],
    warnings: [],
  };
}

describe('projectEquityCurve', () => {
  it('emits an origin seed even with no trades', () => {
    const curve = projectEquityCurve([]);
    expect(curve).toHaveLength(1);
    expect(curve[0]).toMatchObject({
      index: 0,
      cumulativeR: 0,
      tradeR: 0,
      peakR: 0,
      drawdownR: 0,
    });
  });

  it('tracks cumulative R, peak, and drawdown across mixed outcomes', () => {
    // +2, -1, -1, +1.5 → cumulative path 0, 2, 1, 0, 1.5
    // peak hits 2 at trade 1, drawdown bottoms at 2 (trade 3), recovers to 1.5
    const curve = projectEquityCurve([
      trade(2, 0),
      trade(-1, 1),
      trade(-1, 2),
      trade(1.5, 3),
    ]);

    expect(curve.map((p) => p.cumulativeR)).toEqual([0, 2, 1, 0, 1.5]);
    expect(curve.map((p) => p.peakR)).toEqual([0, 2, 2, 2, 2]);
    expect(curve.map((p) => p.drawdownR)).toEqual([0, 0, 1, 2, 0.5]);
  });

  it('keeps drawdown non-negative even when curve runs above peak (monotonic peak)', () => {
    const curve = projectEquityCurve([trade(1, 0), trade(1, 1), trade(1, 2)]);
    for (const p of curve) {
      expect(p.drawdownR).toBeGreaterThanOrEqual(0);
      expect(p.peakR).toBeGreaterThanOrEqual(p.cumulativeR);
    }
  });
});
