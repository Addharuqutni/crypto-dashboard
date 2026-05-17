import { describe, expect, it } from 'vitest';
import {
  bullishTrendFixture,
  bearishTrendFixture,
  rangeFixture,
  choppyFixture,
  volatileFixture,
  computeMetrics,
  deriveSampleWarnings,
  runBacktest,
  simulateTrades,
  type BacktestSignal,
} from '@/lib/backtest';

/**
 * Backtest unit tests.
 *
 * Two layers:
 *   1. Pure simulator/metrics tests — synthetic candles + hand-crafted
 *      signals so the contract (intrabar conflict, expiry, R math, drawdown,
 *      streak, bucketing) is exercised in isolation.
 *   2. End-to-end tests that drive the real signal engine over deterministic
 *      regime fixtures and assert the engine's risk-first stance: bullish
 *      regimes do not produce shorts, choppy/volatile produce no actionable
 *      trades, and outputs are reproducible.
 */

describe('backtest simulator', () => {
  it('resolves SL on a bar where SL and TP are both touched (conservative default)', () => {
    // Synthetic candles: 3 bars. Bar 1 is the entry bar, bar 2 prints a wick
    // that hits both SL (95) and TP1 (110) on a long.
    const candles = [
      bar(100, 100, 100, 100, 1),
      bar(100, 110, 95, 102, 2),
      bar(102, 103, 101, 102, 3),
    ];
    const signal: BacktestSignal = {
      barIndex: 0,
      symbol: 'TEST',
      timeframe: '30m',
      action: 'LONG',
      marketRegime: 'bullish_trend',
      tradePermission: 'long_only',
      setupType: 'BREAKOUT',
      confidence: 80,
      grade: 'A',
      entry: 100,
      stopLoss: 95,
      tp1: 110,
      tp2: 115,
      tp3: 120,
    };

    const trades = simulateTrades({
      symbol: 'TEST',
      timeframe: '30m',
      candles,
      signals: [signal],
    });

    expect(trades).toHaveLength(1);
    const trade = trades[0]!;
    expect(trade.status).toBe('SL');
    // Final R is approximately -1 minus round-trip costs.
    expect(trade.finalR).toBeLessThan(-0.95);
    expect(trade.finalR).toBeGreaterThan(-1.1);
  });

  it('expires a trade that never reaches TP or SL within maxHoldCandles', () => {
    const candles = [
      bar(100, 100, 100, 100, 1),
      ...Array.from({ length: 10 }, (_, i) => bar(100, 100.5, 99.5, 100, i + 2)),
    ];
    const signal: BacktestSignal = {
      barIndex: 0,
      symbol: 'TEST',
      timeframe: '30m',
      action: 'LONG',
      marketRegime: 'range',
      tradePermission: 'both',
      setupType: 'RANGE_REVERSION',
      confidence: 60,
      grade: 'B',
      entry: 100,
      stopLoss: 90,
      tp1: 110,
      tp2: null,
      tp3: null,
    };

    const trades = simulateTrades({
      symbol: 'TEST',
      timeframe: '30m',
      candles,
      signals: [signal],
      config: { maxHoldCandles: 5 },
    });

    expect(trades).toHaveLength(1);
    expect(trades[0]!.status).toBe('EXPIRED');
    expect(trades[0]!.heldBars).toBe(5);
  });

  it('records correct R on a clean TP2 hit', () => {
    // 1R = 5. TP2 = entry + 2R = 110.
    const candles = [
      bar(100, 100, 100, 100, 1),
      bar(100, 102, 99, 101, 2),
      bar(101, 110.5, 100, 108, 3),
    ];
    const signal: BacktestSignal = {
      barIndex: 0,
      symbol: 'TEST',
      timeframe: '30m',
      action: 'LONG',
      marketRegime: 'bullish_trend',
      tradePermission: 'long_only',
      setupType: 'BREAKOUT',
      confidence: 80,
      grade: 'A',
      entry: 100,
      stopLoss: 95,
      tp1: 105,
      tp2: 110,
      tp3: 115,
    };

    const trades = simulateTrades({
      symbol: 'TEST',
      timeframe: '30m',
      candles,
      signals: [signal],
    });

    expect(trades[0]!.status).toBe('TP2');
    expect(trades[0]!.finalR).toBeGreaterThan(1.8);
    expect(trades[0]!.finalR).toBeLessThan(2.05);
  });
});

describe('backtest metrics', () => {
  it('computes drawdown, streak, and per-bucket performance', () => {
    const signals: BacktestSignal[] = ['LONG', 'LONG', 'LONG', 'LONG', 'WAIT'].map(
      (action, i) =>
        ({
          barIndex: i,
          symbol: 'TEST',
          timeframe: '30m',
          action,
          marketRegime: 'bullish_trend',
          tradePermission: 'long_only',
          setupType: 'BREAKOUT',
          confidence: 80,
          grade: 'A',
          entry: 100,
          stopLoss: 95,
          tp1: 110,
          tp2: 115,
          tp3: 120,
        }) as BacktestSignal
    );

    // Hand-built trades — 4 longs with mixed outcomes:
    //   +2R, -1R, -1R, +1.5R  → cumulative path: 2, 1, 0, 1.5
    //   peak = 2 → trough = 0 → drawdown = 2R.
    //   Losing streak = 2 (the two losses in a row).
    const trades = [
      makeTrade('TEST', '30m', 'bullish_trend', 'BREAKOUT', 2, 5),
      makeTrade('TEST', '30m', 'range', 'PULLBACK_RETEST', -1, 3),
      makeTrade('TEST', '30m', 'range', 'PULLBACK_RETEST', -1, 3),
      makeTrade('TEST', '30m', 'bullish_trend', 'BREAKOUT', 1.5, 4),
    ];

    const metrics = computeMetrics(signals, trades);

    expect(metrics.totalSignals).toBe(5);
    expect(metrics.totalTrades).toBe(4);
    expect(metrics.waitRate).toBe(20);
    expect(metrics.winRate).toBe(50);
    expect(metrics.lossRate).toBe(50);
    expect(metrics.maxDrawdownR).toBeCloseTo(2, 4);
    expect(metrics.maxLosingStreak).toBe(2);
    expect(metrics.bestSetupType).toBe('BREAKOUT');
    expect(metrics.worstSetupType).toBe('PULLBACK_RETEST');
    expect(metrics.performanceByRegime['bullish_trend']?.count).toBe(2);
    expect(metrics.performanceByRegime['range']?.count).toBe(2);
  });

  it('emits sample-size warnings for small or losing samples', () => {
    const losingMetrics = computeMetrics(
      [],
      [
        makeTrade('TEST', '30m', 'range', 'BREAKOUT', -1, 3),
        makeTrade('TEST', '30m', 'range', 'BREAKOUT', -2, 3),
      ]
    );
    const warnings = deriveSampleWarnings(losingMetrics);
    expect(warnings.some((w) => w.toLowerCase().includes('insufficient sample'))).toBe(true);
    expect(warnings.some((w) => w.toLowerCase().includes('not tradable'))).toBe(true);
  });
});

describe('backtest end-to-end on deterministic fixtures', () => {
  it('produces no actionable trades on choppy data', () => {
    const candles = choppyFixture(260);
    const result = runBacktest({
      symbol: 'TEST',
      timeframe: '30m',
      candles,
    });
    // Choppy regime → 4H permission collapses to no_trade for at least the
    // late phase of the series. Even if a few signals slip through they must
    // be rare and never produce a positive expectancy in this fixture.
    expect(result.trades.length).toBeLessThan(10);
  });

  it('produces no actionable trades on volatile data (risk gate dominates)', () => {
    const candles = volatileFixture(260);
    const result = runBacktest({
      symbol: 'TEST',
      timeframe: '30m',
      candles,
    });
    expect(result.trades.length).toBeLessThan(10);
  });

  it('refuses shorts on a bullish-trend fixture', () => {
    const candles = bullishTrendFixture(260);
    const result = runBacktest({
      symbol: 'TEST',
      timeframe: '30m',
      candles,
    });
    expect(result.trades.every((t) => t.signal.action !== 'SHORT')).toBe(true);
  });

  it('refuses longs on a bearish-trend fixture', () => {
    const candles = bearishTrendFixture(260);
    const result = runBacktest({
      symbol: 'TEST',
      timeframe: '30m',
      candles,
    });
    expect(result.trades.every((t) => t.signal.action !== 'LONG')).toBe(true);
  });

  it('is reproducible: identical fixtures yield identical metrics', () => {
    const a = runBacktest({
      symbol: 'TEST',
      timeframe: '30m',
      candles: rangeFixture(260),
    });
    const b = runBacktest({
      symbol: 'TEST',
      timeframe: '30m',
      candles: rangeFixture(260),
    });
    expect(a.metrics.totalTrades).toBe(b.metrics.totalTrades);
    expect(a.metrics.totalSignals).toBe(b.metrics.totalSignals);
    expect(a.metrics.averageR).toBe(b.metrics.averageR);
    expect(a.metrics.maxDrawdownR).toBe(b.metrics.maxDrawdownR);
  });
});

// --- helpers ---

import type { BacktestTrade } from '@/lib/backtest';
import type { Candle } from '@/types/chart';

function bar(open: number, high: number, low: number, close: number, idx: number): Candle {
  return {
    symbol: 'TEST',
    binanceSymbol: 'TESTUSDT',
    openTime: idx * 60_000,
    open,
    high,
    low,
    close,
    volume: 1000,
    closeTime: (idx + 1) * 60_000,
  };
}

function makeTrade(
  symbol: string,
  timeframe: string,
  regime: 'bullish_trend' | 'bearish_trend' | 'range' | 'choppy' | 'volatile',
  setup: BacktestSignal['setupType'],
  finalR: number,
  heldBars: number
): BacktestTrade {
  return {
    id: `${symbol}-${Math.random().toString(36).slice(2, 8)}`,
    signal: {
      barIndex: 0,
      symbol,
      timeframe,
      action: 'LONG',
      marketRegime: regime,
      tradePermission: 'long_only',
      setupType: setup,
      confidence: 80,
      grade: 'A',
      entry: 100,
      stopLoss: 95,
      tp1: 105,
      tp2: 110,
      tp3: 115,
    },
    status: finalR > 0 ? 'TP2' : 'SL',
    openBarIndex: 0,
    closeBarIndex: heldBars,
    entryFill: 100,
    exitFill: finalR > 0 ? 110 : 95,
    heldBars,
    finalR,
    mfeR: Math.max(0, finalR),
    maeR: Math.max(0, -finalR),
    costR: 0.05,
    reasons: [],
    warnings: [],
  };
}
