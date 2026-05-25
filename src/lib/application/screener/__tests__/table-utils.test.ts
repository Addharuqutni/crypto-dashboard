import { describe, it, expect } from 'vitest';
import {
  filterScreenerResults,
  sortScreenerResults,
  countActiveScreenerFilters,
  DEFAULT_SCREENER_FILTERS,
  DEFAULT_SCREENER_SORT,
  calculateDistanceToEntryPercent,
  isProfileEligible,
} from '../table-utils';
import type { RankedScreenerResult } from '../types';
import type { ScreenerFilters, ScreenerSort } from '../table-utils';

function makeResult(overrides: Partial<RankedScreenerResult> = {}): RankedScreenerResult {
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
    currentPrice: 104000,
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
    freshness: {
      setupCandleAgeSec: 60,
      macroCandleAgeSec: 120,
      triggerCandleAgeSec: 30,
      fundingAgeSec: 300,
      openInterestAgeSec: 300,
    },
    rank: 1,
    rankingScore: 80,
    rankReason: ['Score: 80'],
    alertEligible: true,
    alertBlockReasons: [],
    ...overrides,
  };
}

describe('filterScreenerResults', () => {
  const results: RankedScreenerResult[] = [
    makeResult({ symbol: 'BTCUSDT', action: 'LONG', grade: 'A', confidence: 85, alertEligible: true }),
    makeResult({ symbol: 'ETHUSDT', action: 'SHORT', grade: 'B', confidence: 72, alertEligible: true, marketCapRank: 2, rank: 2 }),
    makeResult({ symbol: 'SOLUSDT', action: 'WAIT', grade: 'D', confidence: 55, alertEligible: false, marketCapRank: 4, rank: 0, dataHealth: { ok: false, symbol: { provided: true, valid: true, reason: null }, setup: { required: true, candleCount: 50, minCandlesRequired: 100, lastCandleAgeSec: 60, maxAgeSec: 3600, ok: false, reason: 'insufficient' }, macro: { required: true, candleCount: 200, minCandlesRequired: 100, lastCandleAgeSec: 60, maxAgeSec: 3600, ok: true, reason: null }, trigger: { required: true, candleCount: 200, minCandlesRequired: 50, lastCandleAgeSec: 60, maxAgeSec: 1800, ok: true, reason: null }, funding: { available: true, ageSec: 300, maxAgeSec: 32400, ok: true }, openInterest: { available: true, ageSec: 300, maxAgeSec: 900, ok: true }, reasons: ['insufficient setup candles'], confidenceCap: 60 } }),
  ];

  it('returns all results with default filters', () => {
    const filtered = filterScreenerResults(results, DEFAULT_SCREENER_FILTERS);
    expect(filtered).toHaveLength(3);
  });

  it('filters by action LONG', () => {
    const filtered = filterScreenerResults(results, { ...DEFAULT_SCREENER_FILTERS, action: 'LONG' });
    expect(filtered).toHaveLength(1);
    expect(filtered[0]!.symbol).toBe('BTCUSDT');
  });

  it('filters by action SHORT', () => {
    const filtered = filterScreenerResults(results, { ...DEFAULT_SCREENER_FILTERS, action: 'SHORT' });
    expect(filtered).toHaveLength(1);
    expect(filtered[0]!.symbol).toBe('ETHUSDT');
  });

  it('filters by action WAIT', () => {
    const filtered = filterScreenerResults(results, { ...DEFAULT_SCREENER_FILTERS, action: 'WAIT' });
    expect(filtered).toHaveLength(1);
    expect(filtered[0]!.symbol).toBe('SOLUSDT');
  });

  it('filters by grade', () => {
    const filtered = filterScreenerResults(results, { ...DEFAULT_SCREENER_FILTERS, grade: 'A' });
    expect(filtered).toHaveLength(1);
    expect(filtered[0]!.symbol).toBe('BTCUSDT');
  });

  it('filters by minimum confidence', () => {
    const filtered = filterScreenerResults(results, { ...DEFAULT_SCREENER_FILTERS, minConfidence: 80 });
    expect(filtered).toHaveLength(1);
    expect(filtered[0]!.symbol).toBe('BTCUSDT');
  });

  it('filters eligible only', () => {
    const filtered = filterScreenerResults(results, { ...DEFAULT_SCREENER_FILTERS, eligibleOnly: true });
    expect(filtered).toHaveLength(2);
    expect(filtered.every((r) => r.alertEligible)).toBe(true);
  });

  it('filters healthy data only', () => {
    const filtered = filterScreenerResults(results, { ...DEFAULT_SCREENER_FILTERS, dataFilter: 'healthy' });
    expect(filtered).toHaveLength(2);
    expect(filtered.every((r) => r.dataHealth.ok)).toBe(true);
  });

  it('filters degraded data only', () => {
    const filtered = filterScreenerResults(results, { ...DEFAULT_SCREENER_FILTERS, dataFilter: 'degraded' });
    expect(filtered).toHaveLength(1);
    expect(filtered[0]!.symbol).toBe('SOLUSDT');
  });

  it('combines multiple filters', () => {
    const filters: ScreenerFilters = {
      action: 'LONG',
      grade: 'ALL',
      minConfidence: 80,
      eligibleOnly: true,
      profileEligibleOnly: false,
      dataFilter: 'healthy',
    };
    const filtered = filterScreenerResults(results, filters);
    expect(filtered).toHaveLength(1);
    expect(filtered[0]!.symbol).toBe('BTCUSDT');
  });

  it('filters by selected risk profile eligibility', () => {
    const filtered = filterScreenerResults(
      results,
      { ...DEFAULT_SCREENER_FILTERS, profileEligibleOnly: true },
      {
        id: 'swing',
        label: 'Swing',
        description: 'Strict swing profile',
        minConfidence: 70,
        minRiskReward: 3,
        maxLeverage: 3,
        allowCountertrend: false,
        cooldownMultiplier: 2,
      }
    );

    expect(filtered).toHaveLength(0);
  });
});

describe('sortScreenerResults', () => {
  const results: RankedScreenerResult[] = [
    makeResult({ symbol: 'BTCUSDT', rank: 1, confidence: 85, grade: 'A', rankingScore: 80, riskReward: 2.5, marketCapRank: 1, freshness: { setupCandleAgeSec: 60, macroCandleAgeSec: 120, triggerCandleAgeSec: 30, fundingAgeSec: 300, openInterestAgeSec: 300 } }),
    makeResult({ symbol: 'ETHUSDT', rank: 2, confidence: 72, grade: 'B', rankingScore: 65, riskReward: 1.8, marketCapRank: 2, freshness: { setupCandleAgeSec: 120, macroCandleAgeSec: 240, triggerCandleAgeSec: 60, fundingAgeSec: 600, openInterestAgeSec: 600 } }),
    makeResult({ symbol: 'SOLUSDT', rank: 0, confidence: 55, grade: 'D', rankingScore: 40, riskReward: null, marketCapRank: 4, freshness: { setupCandleAgeSec: 300, macroCandleAgeSec: 600, triggerCandleAgeSec: 150, fundingAgeSec: null, openInterestAgeSec: null } }),
  ];

  it('sorts by rank ascending (default)', () => {
    const sorted = sortScreenerResults(results, DEFAULT_SCREENER_SORT);
    expect(sorted[0]!.symbol).toBe('BTCUSDT');
    expect(sorted[1]!.symbol).toBe('ETHUSDT');
    expect(sorted[2]!.symbol).toBe('SOLUSDT'); // rank 0 pushed to bottom
  });

  it('sorts by confidence descending', () => {
    const sort: ScreenerSort = { field: 'confidence', direction: 'desc' };
    const sorted = sortScreenerResults(results, sort);
    expect(sorted[0]!.symbol).toBe('BTCUSDT');
    expect(sorted[2]!.symbol).toBe('SOLUSDT');
  });

  it('sorts by grade ascending (A first)', () => {
    const sort: ScreenerSort = { field: 'grade', direction: 'asc' };
    const sorted = sortScreenerResults(results, sort);
    expect(sorted[0]!.grade).toBe('A');
    expect(sorted[2]!.grade).toBe('D');
  });

  it('sorts by rankingScore descending', () => {
    const sort: ScreenerSort = { field: 'rankingScore', direction: 'desc' };
    const sorted = sortScreenerResults(results, sort);
    expect(sorted[0]!.rankingScore).toBe(80);
    expect(sorted[2]!.rankingScore).toBe(40);
  });

  it('sorts by riskReward descending (null treated as 0)', () => {
    const sort: ScreenerSort = { field: 'riskReward', direction: 'desc' };
    const sorted = sortScreenerResults(results, sort);
    expect(sorted[0]!.riskReward).toBe(2.5);
    expect(sorted[2]!.riskReward).toBeNull();
  });

  it('sorts by freshness ascending (freshest first)', () => {
    const sort: ScreenerSort = { field: 'freshness', direction: 'asc' };
    const sorted = sortScreenerResults(results, sort);
    expect(sorted[0]!.symbol).toBe('BTCUSDT');
    expect(sorted[2]!.symbol).toBe('SOLUSDT');
  });

  it('sorts by marketCapRank ascending', () => {
    const sort: ScreenerSort = { field: 'marketCapRank', direction: 'asc' };
    const sorted = sortScreenerResults(results, sort);
    expect(sorted[0]!.marketCapRank).toBe(1);
    expect(sorted[2]!.marketCapRank).toBe(4);
  });
});

describe('countActiveScreenerFilters', () => {
  it('returns 0 for default filters', () => {
    expect(countActiveScreenerFilters(DEFAULT_SCREENER_FILTERS)).toBe(0);
  });

  it('counts each active filter', () => {
    expect(countActiveScreenerFilters({ ...DEFAULT_SCREENER_FILTERS, action: 'LONG' })).toBe(1);
    expect(countActiveScreenerFilters({ ...DEFAULT_SCREENER_FILTERS, action: 'LONG', grade: 'A' })).toBe(2);
    expect(countActiveScreenerFilters({ ...DEFAULT_SCREENER_FILTERS, minConfidence: 50, eligibleOnly: true, dataFilter: 'healthy' })).toBe(3);
    expect(countActiveScreenerFilters({ ...DEFAULT_SCREENER_FILTERS, profileEligibleOnly: true })).toBe(1);
  });
});

describe('isProfileEligible', () => {
  const balanced = {
    id: 'balanced' as const,
    label: 'Balanced',
    description: 'Balanced profile',
    minConfidence: 65,
    minRiskReward: 2,
    maxLeverage: 5,
    allowCountertrend: false,
    cooldownMultiplier: 1,
  };

  it('accepts clean setups that satisfy profile confidence and RR floors', () => {
    expect(isProfileEligible(makeResult({ confidence: 70, riskReward: 2.1 }), balanced)).toBe(true);
  });

  it('rejects WAIT and degraded setups', () => {
    expect(isProfileEligible(makeResult({ action: 'WAIT' }), balanced)).toBe(false);
    expect(isProfileEligible(makeResult({ dataHealth: { ...makeResult().dataHealth, ok: false } }), balanced)).toBe(false);
  });

  it('rejects setups that conflict with trade permission when the profile disallows countertrend', () => {
    expect(isProfileEligible(makeResult({ action: 'LONG', tradePermission: 'short_only' }), balanced)).toBe(false);
  });
});

describe('calculateDistanceToEntryPercent', () => {
  it('returns the signed percentage distance from current price to engine entry', () => {
    const distance = calculateDistanceToEntryPercent(makeResult({ entry: 105, currentPrice: 100 }));
    expect(distance).toBeCloseTo(5, 2);
  });

  it('returns null without a valid entry or current price', () => {
    expect(calculateDistanceToEntryPercent(makeResult({ entry: null }))).toBeNull();
    expect(calculateDistanceToEntryPercent(makeResult({ currentPrice: null }))).toBeNull();
  });
});
