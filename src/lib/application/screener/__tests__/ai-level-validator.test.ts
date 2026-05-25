import { describe, it, expect } from 'vitest';
import {
  validateAiProposedLevels,
} from '../ai-level-validator';
import type { RankedScreenerResult, AiProposedLevels } from '../types';

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

function makeProposal(overrides: Partial<AiProposedLevels> = {}): AiProposedLevels {
  return {
    entry: 105100,
    stopLoss: 103000,
    takeProfits: [107000, 109000],
    basis: ['ATR band at 105100', 'Support at 103000'],
    ...overrides,
  };
}

describe('validateAiProposedLevels', () => {
  it('returns NOT_PROVIDED when proposal is null', () => {
    const result = validateAiProposedLevels(makeRanked(), null);
    expect(result.status).toBe('NOT_PROVIDED');
    expect(result.reasons).toEqual([]);
  });

  it('returns NOT_PROVIDED when proposal is undefined', () => {
    const result = validateAiProposedLevels(makeRanked(), undefined);
    expect(result.status).toBe('NOT_PROVIDED');
    expect(result.reasons).toEqual([]);
  });

  it('validates a correct LONG proposal', () => {
    const result = validateAiProposedLevels(makeRanked(), makeProposal());
    expect(result.status).toBe('VALIDATED');
    expect(result.reasons).toEqual([]);
  });

  it('validates a correct SHORT proposal', () => {
    const result = validateAiProposedLevels(
      makeRanked({ action: 'SHORT', entry: 105000, stopLoss: 107000, riskReward: 2.0 }),
      makeProposal({ entry: 105000, stopLoss: 107000, takeProfits: [103000, 101000] })
    );
    expect(result.status).toBe('VALIDATED');
  });

  it('rejects when data health is not OK', () => {
    const result = validateAiProposedLevels(
      makeRanked({ dataHealth: { ...makeRanked().dataHealth, ok: false } }),
      makeProposal()
    );
    expect(result.status).toBe('REJECTED');
    expect(result.reasons).toContain('data_health_not_ok');
  });

  it('rejects when engine action is WAIT', () => {
    const result = validateAiProposedLevels(
      makeRanked({ action: 'WAIT' }),
      makeProposal()
    );
    expect(result.status).toBe('REJECTED');
    expect(result.reasons).toContain('engine_action_wait');
  });

  it('rejects when proposal conflicts with engine action direction', () => {
    // LONG action but SL above entry
    const result = validateAiProposedLevels(
      makeRanked({ action: 'LONG' }),
      makeProposal({ stopLoss: 106000 })
    );
    expect(result.status).toBe('REJECTED');
    expect(result.reasons).toContain('stop_loss_wrong_side_for_long');
  });

  it('rejects when entry is too far from engine reference', () => {
    const result = validateAiProposedLevels(
      makeRanked({ entry: 105000 }),
      makeProposal({ entry: 110000 }), // >1% away
      { maxEntryDistancePercent: 1, minRiskReward: 1.5 }
    );
    expect(result.status).toBe('REJECTED');
    expect(result.reasons).toContain('entry_too_far_from_engine_reference');
  });

  it('rejects when SL is on wrong side for SHORT', () => {
    const result = validateAiProposedLevels(
      makeRanked({ action: 'SHORT', entry: 105000, stopLoss: 107000 }),
      makeProposal({ entry: 105000, stopLoss: 103000, takeProfits: [103000] })
    );
    expect(result.status).toBe('REJECTED');
    expect(result.reasons).toContain('stop_loss_wrong_side_for_short');
  });

  it('rejects when TP is on wrong side for LONG', () => {
    const result = validateAiProposedLevels(
      makeRanked({ action: 'LONG' }),
      makeProposal({ takeProfits: [100000] }) // below entry
    );
    expect(result.status).toBe('REJECTED');
    expect(result.reasons).toContain('take_profit_wrong_side_for_long');
  });

  it('rejects when TP is on wrong side for SHORT', () => {
    const result = validateAiProposedLevels(
      makeRanked({ action: 'SHORT', entry: 105000, stopLoss: 107000 }),
      makeProposal({ entry: 105000, stopLoss: 107000, takeProfits: [110000] })
    );
    expect(result.status).toBe('REJECTED');
    expect(result.reasons).toContain('take_profit_wrong_side_for_short');
  });

  it('rejects when R:R is below minimum', () => {
    const result = validateAiProposedLevels(
      makeRanked(),
      makeProposal({ entry: 105000, stopLoss: 103000, takeProfits: [105500] }), // R:R < 1.5
      { maxEntryDistancePercent: 1, minRiskReward: 1.5 }
    );
    expect(result.status).toBe('REJECTED');
    expect(result.reasons).toContain('risk_reward_below_minimum');
  });

  it('rejects when basis is missing', () => {
    const result = validateAiProposedLevels(
      makeRanked(),
      makeProposal({ basis: [] })
    );
    expect(result.status).toBe('REJECTED');
    expect(result.reasons).toContain('basis_missing');
  });

  it('rejects when entry is missing or invalid', () => {
    const result = validateAiProposedLevels(
      makeRanked(),
      makeProposal({ entry: null })
    );
    expect(result.status).toBe('REJECTED');
    expect(result.reasons).toContain('entry_missing_or_invalid');
  });

  it('rejects when stop loss is missing or invalid', () => {
    const result = validateAiProposedLevels(
      makeRanked(),
      makeProposal({ stopLoss: null })
    );
    expect(result.status).toBe('REJECTED');
    expect(result.reasons).toContain('stop_loss_missing_or_invalid');
  });

  it('rejects when take profits are empty', () => {
    const result = validateAiProposedLevels(
      makeRanked(),
      makeProposal({ takeProfits: [] })
    );
    expect(result.status).toBe('REJECTED');
    expect(result.reasons).toContain('take_profit_missing_or_invalid');
  });

  it('deduplicates rejection reasons', () => {
    const result = validateAiProposedLevels(
      makeRanked({ action: 'SHORT', entry: 105000, stopLoss: 107000 }),
      makeProposal({ entry: 105000, stopLoss: 103000, takeProfits: [108000, 109000] })
    );
    expect(result.status).toBe('REJECTED');
    // TP wrong side appears only once despite two bad TPs
    const tpReasons = result.reasons.filter((r) => r === 'take_profit_wrong_side_for_short');
    expect(tpReasons.length).toBe(1);
  });
});
