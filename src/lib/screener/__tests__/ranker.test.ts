import { describe, it, expect } from 'vitest';
import { rankScreenerResults } from '../ranker';
import { DEFAULT_SCREENER_ALERT_SETTINGS, gradeMeets, gradeRank } from '../config';
import type { ScreenerResult, ScreenerAlertSettings } from '../types';

/**
 * Factory to produce a valid ScreenerResult with defaults that pass eligibility.
 * Override individual fields via the `overrides` parameter.
 */
function makeResult(overrides: Partial<ScreenerResult> = {}): ScreenerResult {
  return {
    symbol: 'BTCUSDT',
    baseAsset: 'BTC',
    quoteAsset: 'USDT',
    marketCapRank: 1,
    setupTimeframe: '30m',
    triggerTimeframe: '15m',
    macroTimeframe: '4h',
    evaluatedAt: Date.now(),
    candleCloseTime: Date.now(),
    dataHealth: {
      ok: true,
      symbol: { provided: true, valid: true, reason: null },
      setup: { required: true, candleCount: 200, minCandlesRequired: 100, lastCandleAgeSec: 60, maxAgeSec: 3600, ok: true, reason: null },
      macro: { required: true, candleCount: 200, minCandlesRequired: 100, lastCandleAgeSec: 60, maxAgeSec: 3600, ok: true, reason: null },
      trigger: { required: true, candleCount: 200, minCandlesRequired: 50, lastCandleAgeSec: 60, maxAgeSec: 1800, ok: true, reason: null },
      funding: { available: true, ageSec: 300, maxAgeSec: 32400, ok: true },
      openInterest: { available: true, ageSec: 300, maxAgeSec: 900, ok: true },
      reasons: [],
      confidenceCap: 100,
    },
    action: 'LONG',
    confidence: 85,
    grade: 'A',
    entry: 105000,
    stopLoss: 103000,
    takeProfits: [106000, 108000, 110000],
    riskReward: 2.5,
    marketRegime: 'bullish_trend',
    tradePermission: 'both',
    reasons: ['Strong bullish trend'],
    noTradeReasons: [],
    fundingRate: 0.0001,
    openInterestChangePercent: 2,
    mtfAlignmentScore: 80,
    warnings: [],
    ...overrides,
  };
}

const defaultSettings: ScreenerAlertSettings = DEFAULT_SCREENER_ALERT_SETTINGS;

/** Return an indexed result or fail the test with a clear message. */
function rankedAt<T>(items: T[], index: number): T {
  const item = items[index];
  expect(item).toBeDefined();
  return item as T;
}

describe('rankScreenerResults', () => {
  it('returns empty array for no inputs', () => {
    const ranked = rankScreenerResults([], defaultSettings);
    expect(ranked).toHaveLength(0);
  });

  it('eligible results are ranked 1..N in descending score order', () => {
    const results = [
      makeResult({ symbol: 'ETHUSDT', confidence: 80, grade: 'B', riskReward: 2.0, marketCapRank: 2 }),
      makeResult({ symbol: 'BTCUSDT', confidence: 90, grade: 'A', riskReward: 3.0, marketCapRank: 1 }),
      makeResult({ symbol: 'SOLUSDT', confidence: 85, grade: 'A', riskReward: 2.5, marketCapRank: 4 }),
    ];
    const ranked = rankScreenerResults(results, defaultSettings);
    const eligible = ranked.filter((r) => r.alertEligible);

    expect(eligible.length).toBe(3);
    expect(rankedAt(eligible, 0).rank).toBe(1);
    expect(rankedAt(eligible, 1).rank).toBe(2);
    expect(rankedAt(eligible, 2).rank).toBe(3);
    // Highest confidence+grade should rank first.
    expect(rankedAt(eligible, 0).symbol).toBe('BTCUSDT');
  });

  it('ranking is stable for identical inputs', () => {
    const results = [
      makeResult({ symbol: 'ETHUSDT', confidence: 85, grade: 'A', riskReward: 2.5 }),
      makeResult({ symbol: 'BTCUSDT', confidence: 85, grade: 'A', riskReward: 2.5 }),
    ];
    const run1 = rankScreenerResults(results, defaultSettings);
    const run2 = rankScreenerResults(results, defaultSettings);

    expect(run1.map((r) => r.symbol)).toEqual(run2.map((r) => r.symbol));
    expect(run1.map((r) => r.rankingScore)).toEqual(run2.map((r) => r.rankingScore));
    expect(run1.map((r) => r.rank)).toEqual(run2.map((r) => r.rank));
  });

  it('WAIT results are ineligible with rank 0', () => {
    const results = [
      makeResult({ symbol: 'BTCUSDT', action: 'WAIT', confidence: 90, grade: 'A' }),
    ];
    const ranked = rankScreenerResults(results, defaultSettings);
    expect(rankedAt(ranked, 0).rank).toBe(0);
    expect(rankedAt(ranked, 0).alertEligible).toBe(false);
    expect(rankedAt(ranked, 0).alertBlockReasons).toContain('Action is WAIT');
  });

  it('low confidence makes result ineligible', () => {
    const results = [
      makeResult({ symbol: 'BTCUSDT', confidence: 50 }),
    ];
    const ranked = rankScreenerResults(results, defaultSettings);
    expect(rankedAt(ranked, 0).alertEligible).toBe(false);
    expect(rankedAt(ranked, 0).alertBlockReasons.some((r) => r.includes('Confidence'))).toBe(true);
  });

  it('low grade makes result ineligible', () => {
    const results = [
      makeResult({ symbol: 'BTCUSDT', grade: 'D' }),
    ];
    const ranked = rankScreenerResults(results, defaultSettings);
    expect(rankedAt(ranked, 0).alertEligible).toBe(false);
    expect(rankedAt(ranked, 0).alertBlockReasons.some((r) => r.includes('Grade'))).toBe(true);
  });

  it('unhealthy data makes result ineligible', () => {
    const results = [
      makeResult({
        symbol: 'BTCUSDT',
        dataHealth: {
          ok: false,
          symbol: { provided: true, valid: true, reason: null },
          setup: { required: true, candleCount: 10, minCandlesRequired: 100, lastCandleAgeSec: 60, maxAgeSec: 3600, ok: false, reason: 'Insufficient candles' },
          macro: { required: true, candleCount: 200, minCandlesRequired: 100, lastCandleAgeSec: 60, maxAgeSec: 3600, ok: true, reason: null },
          trigger: { required: true, candleCount: 200, minCandlesRequired: 50, lastCandleAgeSec: 60, maxAgeSec: 1800, ok: true, reason: null },
          funding: { available: true, ageSec: 300, maxAgeSec: 32400, ok: true },
          openInterest: { available: true, ageSec: 300, maxAgeSec: 900, ok: true },
          reasons: ['Insufficient candles'],
          confidenceCap: 50,
        },
      }),
    ];
    const ranked = rankScreenerResults(results, defaultSettings);
    expect(rankedAt(ranked, 0).alertEligible).toBe(false);
    expect(rankedAt(ranked, 0).alertBlockReasons).toContain('Data health is not OK');
  });

  it('low risk-reward makes result ineligible', () => {
    const results = [
      makeResult({ symbol: 'BTCUSDT', riskReward: 0.5 }),
    ];
    const ranked = rankScreenerResults(results, defaultSettings);
    expect(rankedAt(ranked, 0).alertEligible).toBe(false);
    expect(rankedAt(ranked, 0).alertBlockReasons.some((r) => r.includes('R:R'))).toBe(true);
  });

  it('trade permission conflict makes result ineligible', () => {
    const results = [
      makeResult({ symbol: 'BTCUSDT', action: 'LONG', tradePermission: 'short_only' }),
    ];
    const ranked = rankScreenerResults(results, defaultSettings);
    expect(rankedAt(ranked, 0).alertEligible).toBe(false);
    expect(rankedAt(ranked, 0).alertBlockReasons.some((r) => r.includes('permission'))).toBe(true);
  });

  it('extreme funding rate applies penalty', () => {
    const clean = makeResult({ symbol: 'BTCUSDT', fundingRate: 0.0001 });
    const extreme = makeResult({ symbol: 'ETHUSDT', fundingRate: 0.002 });
    const ranked = rankScreenerResults([clean, extreme], defaultSettings);
    const btc = ranked.find((r) => r.symbol === 'BTCUSDT')!;
    const eth = ranked.find((r) => r.symbol === 'ETHUSDT')!;
    expect(btc.rankingScore).toBeGreaterThan(eth.rankingScore);
  });

  it('eligible results appear before ineligible in output', () => {
    const results = [
      makeResult({ symbol: 'BTCUSDT', action: 'WAIT' }),
      makeResult({ symbol: 'ETHUSDT', confidence: 90, grade: 'A' }),
    ];
    const ranked = rankScreenerResults(results, defaultSettings);
    expect(rankedAt(ranked, 0).alertEligible).toBe(true);
    expect(rankedAt(ranked, 0).symbol).toBe('ETHUSDT');
    expect(rankedAt(ranked, 1).alertEligible).toBe(false);
  });
});

describe('gradeMeets', () => {
  it('A meets B', () => expect(gradeMeets('A', 'B')).toBe(true));
  it('B meets B', () => expect(gradeMeets('B', 'B')).toBe(true));
  it('C does not meet B', () => expect(gradeMeets('C', 'B')).toBe(false));
  it('D does not meet A', () => expect(gradeMeets('D', 'A')).toBe(false));
});

describe('gradeRank', () => {
  it('A < B < C < D', () => {
    expect(gradeRank('A')).toBeLessThan(gradeRank('B'));
    expect(gradeRank('B')).toBeLessThan(gradeRank('C'));
    expect(gradeRank('C')).toBeLessThan(gradeRank('D'));
  });
});
