import { describe, it, expect } from 'vitest';
import { mapScreenerToJournal, describeJournalBlock } from '../to-journal';
import type { RankedScreenerResult } from '../types';

function makeRanked(overrides: Partial<RankedScreenerResult> = {}): RankedScreenerResult {
  return {
    symbol: 'BTCUSDT',
    baseAsset: 'BTC',
    quoteAsset: 'USDT',
    marketCapRank: 1,
    setupTimeframe: '30m',
    triggerTimeframe: '15m',
    macroTimeframe: '4h',
    evaluatedAt: Date.now(),
    candleCloseTime: 1716000000000,
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
    warnings: ['Elevated OI'],
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

describe('mapScreenerToJournal', () => {
  it('maps a valid LONG result to a journal payload', () => {
    const { payload, blocks } = mapScreenerToJournal(makeRanked());
    expect(blocks).toEqual([]);
    expect(payload).not.toBeNull();
    expect(payload!.symbol).toBe('BTC');
    expect(payload!.action).toBe('LONG');
    expect(payload!.timeframe).toBe('30m');
    expect(payload!.confidenceScore).toBe(85);
    expect(payload!.signalGrade).toBe('A');
    expect(payload!.entryPrice).toBe(105000);
    expect(payload!.stopLoss).toBe(103000);
    expect(payload!.tp1).toBe(106000);
    expect(payload!.tp2).toBe(108000);
    expect(payload!.tp3).toBe(110000);
    expect(payload!.source).toBe('manual');
    expect(payload!.marketRegime).toBe('bullish_trend');
    expect(payload!.tradePermission).toBe('both');
    expect(payload!.riskRewardRatio).toBe(2.5);
    expect(payload!.finalR).toBeNull();
    expect(payload!.expiresAt).toBeNull();
    expect(payload!.reasons).toEqual(['Strong bullish trend']);
    expect(payload!.warnings).toEqual(['Elevated OI']);
    expect(payload!.dataSnapshot).toContain('BTCUSDT|LONG|1716000000000');
  });

  it('maps a valid SHORT result', () => {
    const { payload, blocks } = mapScreenerToJournal(
      makeRanked({ action: 'SHORT', entry: 105000, stopLoss: 107000, takeProfits: [103000] })
    );
    expect(blocks).toEqual([]);
    expect(payload!.action).toBe('SHORT');
    expect(payload!.tp1).toBe(103000);
    expect(payload!.tp2).toBeNull();
    expect(payload!.tp3).toBeNull();
  });

  it('blocks WAIT setups', () => {
    const { payload, blocks } = mapScreenerToJournal(
      makeRanked({ action: 'WAIT', entry: null, stopLoss: null, takeProfits: [] })
    );
    expect(payload).toBeNull();
    expect(blocks).toContain('action_is_wait');
  });

  it('blocks when entry is missing', () => {
    const { payload, blocks } = mapScreenerToJournal(
      makeRanked({ entry: null })
    );
    expect(payload).toBeNull();
    expect(blocks).toContain('missing_entry');
  });

  it('blocks when stop loss is missing', () => {
    const { payload, blocks } = mapScreenerToJournal(
      makeRanked({ stopLoss: null })
    );
    expect(payload).toBeNull();
    expect(blocks).toContain('missing_stop_loss');
  });

  it('blocks when take profits are empty', () => {
    const { payload, blocks } = mapScreenerToJournal(
      makeRanked({ takeProfits: [] })
    );
    expect(payload).toBeNull();
    expect(blocks).toContain('missing_take_profit');
  });

  it('collects multiple block reasons simultaneously', () => {
    const { payload, blocks } = mapScreenerToJournal(
      makeRanked({ action: 'WAIT', entry: null, stopLoss: null, takeProfits: [] })
    );
    expect(payload).toBeNull();
    expect(blocks).toContain('action_is_wait');
    expect(blocks).toContain('missing_entry');
    expect(blocks).toContain('missing_stop_loss');
    expect(blocks).toContain('missing_take_profit');
  });
});

describe('describeJournalBlock', () => {
  it('returns human-readable reasons for each block type', () => {
    expect(describeJournalBlock('action_is_wait')).toContain('WAIT');
    expect(describeJournalBlock('missing_entry')).toContain('entry');
    expect(describeJournalBlock('missing_stop_loss')).toContain('stop loss');
    expect(describeJournalBlock('missing_take_profit')).toContain('take-profit');
  });
});
