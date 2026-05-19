import { describe, expect, it } from 'vitest';
import {
  applyProfile,
  buildAuditorUserPrompt,
  buildMarketContext,
  explainNoTrade,
  getRiskProfile,
  parseAuditorResponse,
  rankSetup,
  type AiAuditorInput,
} from '@/lib/domain/intelligence';
import { AiAuditorParseError } from '@/lib/domain/intelligence/ai-auditor';
import type { Candle } from '@/types/chart';
import type { FuturesSignal } from '@/types/futures-signal';

/**
 * Phase 4 — intelligence layer tests.
 *
 * Covers the four pillars:
 *   - market-context: classification + warning surfaces
 *   - setup-ranking: hard-zero on permission, weighted composite
 *   - risk-profile: applyProfile picks the stricter side
 *   - no-trade: category routing
 *   - ai-auditor: prompt shape, JSON extraction, fabrication detection,
 *     conflict detection
 */

const NOW = 1_700_000_000_000;

function buildCandles(n: number, drift: number, base = 100): Candle[] {
  return Array.from({ length: n }, (_, i) => {
    const open = base * (1 + drift * i);
    const close = open * (1 + drift);
    const high = Math.max(open, close) * 1.001;
    const low = Math.min(open, close) * 0.999;
    return {
      symbol: 'BTC',
      binanceSymbol: 'BTCUSDT',
      openTime: NOW - (n - i) * 1_800_000,
      open,
      high,
      low,
      close,
      volume: 1000,
      closeTime: NOW - (n - i - 1) * 1_800_000,
    };
  });
}

function buildSignal(overrides: Partial<FuturesSignal> = {}): FuturesSignal {
  return {
    action: 'LONG',
    confidenceScore: 80,
    signalGrade: 'A',
    entryTrigger: 'BREAKOUT',
    regime: 'BULLISH_TREND',
    entryZone: { min: 64210.5, max: 64250 },
    stopLoss: 63540,
    takeProfits: { tp1: 65120, tp2: 66000, tp3: 67200 },
    riskRewardRatio: 2.5,
    suggestedLeverage: { min: 1, max: 3 },
    riskLevel: 'LOW',
    invalidationReason: 'Price below SL',
    summary: 'Long bias supported by bullish trend.',
    reasons: ['EMA20 > EMA50', 'ADX 25'],
    warnings: [],
    noTradeReasons: [],
    primaryNoTradeReason: null,
    mtfConfirmation: {
      macroBias: 'BULLISH',
      setupBias: 'BULLISH',
      triggerBias: 'BULLISH',
      alignmentScore: 80,
      conflicts: [],
    },
    positioning: {
      fundingRate: null,
      fundingBias: 'NEUTRAL',
      openInterestChangePercent: null,
      openInterestBias: 'NEUTRAL',
    },
    liquiditySweep: { type: 'NONE', sweptLevel: null, confidence: 0 },
    scoreBreakdown: {
      trendScore: 80,
      momentumScore: 70,
      volumeScore: 60,
      structureScore: 70,
      riskScore: 80,
      finalScore: 80,
    },
    confidence: 80,
    grade: 'A',
    marketRegime: 'bullish_trend',
    tradePermission: 'long_only',
    dataHealth: {
      ok: true,
      symbol: { provided: true, valid: true, reason: null },
      setup: {
        required: true,
        candleCount: 240,
        minCandlesRequired: 200,
        lastCandleAgeSec: 60,
        maxAgeSec: 4500,
        ok: true,
        reason: null,
      },
      macro: {
        required: true,
        candleCount: 240,
        minCandlesRequired: 200,
        lastCandleAgeSec: 600,
        maxAgeSec: 36000,
        ok: true,
        reason: null,
      },
      trigger: {
        required: true,
        candleCount: 60,
        minCandlesRequired: 50,
        lastCandleAgeSec: 60,
        maxAgeSec: 2250,
        ok: true,
        reason: null,
      },
      funding: { available: false, ageSec: null, maxAgeSec: 32400, ok: false },
      openInterest: { available: false, ageSec: null, maxAgeSec: 900, ok: false },
      reasons: [],
      confidenceCap: 70,
    },
    entryStatus: 'triggered',
    riskApproval: 'pass',
    invalidation: 'price below SL',
    reason: ['EMA20 > EMA50', 'ADX 25'],
    ...overrides,
  };
}

describe('market context', () => {
  it('classifies a clean bullish snapshot as normal risk mode', () => {
    const ctx = buildMarketContext({
      btc4hRegime: 'bullish_trend',
      tradePermission: 'long_only',
      btcSetupCandles: buildCandles(240, 0.0008),
      ethSetupCandles: buildCandles(240, 0.0008, 200),
      funding: { rate: 0, observedAt: NOW - 60 * 60_000 },
      openInterest: { current: 1000, baseline: 990, observedAt: NOW - 60_000 },
      nowMs: NOW,
    });
    expect(ctx.btc4hRegime).toBe('bullish_trend');
    expect(ctx.tradePermission).toBe('long_only');
    expect(ctx.riskMode).toBe('normal');
    expect(ctx.warnings.length).toBe(0);
  });

  it('escalates to no_trade when 4h regime is choppy', () => {
    const ctx = buildMarketContext({
      btc4hRegime: 'choppy',
      tradePermission: 'no_trade',
      btcSetupCandles: buildCandles(240, 0),
      nowMs: NOW,
    });
    expect(ctx.riskMode).toBe('no_trade');
  });

  it('records warnings instead of hallucinating missing data', () => {
    const ctx = buildMarketContext({
      btc4hRegime: 'bullish_trend',
      tradePermission: 'long_only',
      btcSetupCandles: buildCandles(240, 0.0005),
      // funding + OI + ETH intentionally omitted
      nowMs: NOW,
    });
    expect(ctx.funding.rate).toBeNull();
    expect(ctx.openInterest.change24hPct).toBeNull();
    expect(ctx.ethCorrelation).toBe('unknown');
    expect(ctx.warnings.length).toBeGreaterThan(0);
  });
});

describe('setup ranking', () => {
  const ctx = buildMarketContext({
    btc4hRegime: 'bullish_trend',
    tradePermission: 'long_only',
    btcSetupCandles: buildCandles(240, 0.0008),
    funding: { rate: 0, observedAt: NOW },
    openInterest: { current: 1000, baseline: 990, observedAt: NOW },
    nowMs: NOW,
  });

  it('hard-zeros regime-alignment when permission denies the action', () => {
    const sig = buildSignal({ action: 'SHORT' });
    const r = rankSetup({ signal: sig, marketContext: ctx });
    expect(r.breakdown.regimeAlignment).toBe(0);
    // Composite drops accordingly.
    expect(r.score).toBeLessThan(70);
  });

  it('rewards aligned setups with high R:R', () => {
    const r = rankSetup({
      signal: buildSignal({ riskRewardRatio: 3.5 }),
      marketContext: ctx,
    });
    expect(r.score).toBeGreaterThanOrEqual(75);
    expect(['A+', 'A', 'B']).toContain(r.grade);
  });
});

describe('risk profile', () => {
  it('applyProfile picks the stricter side of every threshold', () => {
    const conservative = getRiskProfile('conservative');
    const merged = applyProfile(
      {
        minConfidence: 50,
        minRiskReward: 1.5,
        maxLeverage: 10,
        allowCountertrend: true,
        cooldownMultiplier: 1,
      },
      conservative
    );
    expect(merged.minConfidence).toBe(conservative.minConfidence);
    expect(merged.minRiskReward).toBe(conservative.minRiskReward);
    expect(merged.maxLeverage).toBe(conservative.maxLeverage);
    expect(merged.allowCountertrend).toBe(false);
    expect(merged.cooldownMultiplier).toBe(conservative.cooldownMultiplier);
  });
});

describe('no-trade explanation', () => {
  const ctx = buildMarketContext({
    btc4hRegime: 'choppy',
    tradePermission: 'no_trade',
    btcSetupCandles: buildCandles(240, 0),
    nowMs: NOW,
  });

  it('routes choppy/no_trade permission to permission category', () => {
    const sig = buildSignal({ action: 'WAIT', tradePermission: 'no_trade' });
    const ex = explainNoTrade(sig, ctx);
    expect(ex.category).toBe('permission');
  });

  it('routes a failing data-health gate to data category', () => {
    const sig = buildSignal({
      action: 'WAIT',
      dataHealth: {
        ...buildSignal().dataHealth!,
        ok: false,
        setup: {
          ...buildSignal().dataHealth!.setup,
          ok: false,
          reason: 'last candle too old',
        },
      },
    });
    const ex = explainNoTrade(sig, ctx);
    expect(ex.category).toBe('data');
  });
});

describe('ai auditor', () => {
  const auditorInput: AiAuditorInput = {
    symbol: 'BTCUSDT',
    setupTimeframe: '30m',
    macroTimeframe: '4h',
    triggerTimeframe: '15m',
    signal: buildSignal(),
    marketContext: buildMarketContext({
      btc4hRegime: 'bullish_trend',
      tradePermission: 'long_only',
      btcSetupCandles: buildCandles(240, 0.0008),
      nowMs: NOW,
    }),
    ranking: {
      score: 82,
      grade: 'A',
      breakdown: {
        regimeAlignment: 95,
        triggerQuality: 80,
        riskReward: 75,
        dataHealth: 70,
        volatility: 100,
        journalHistory: 50,
      },
      reasons: ['Aligned with regime'],
    },
    riskProfile: 'balanced',
  };

  it('builds a prompt that includes the deterministic action', () => {
    const text = buildAuditorUserPrompt(auditorInput);
    expect(text).toContain('"action":"LONG"');
    expect(text).toContain('BTCUSDT');
  });

  it('parses well-formed JSON correctly', () => {
    const json = JSON.stringify({
      consistent: true,
      consistencyExplanation: 'Engine reasons cohere with the regime.',
      bestArgumentFor: 'EMA stack favors longs.',
      bestArgumentAgainst: 'Confidence is capped because OI is missing.',
      invalidationCondition: 'Close below the engine SL.',
      shouldWait: false,
      shouldWaitReason: 'Setup is approved by the risk engine.',
      caveats: ['OI data unavailable.'],
    });
    const report = parseAuditorResponse(json, auditorInput);
    expect(report.consistent).toBe(true);
    expect(report.shouldWait).toBe(false);
    expect(report.detectedPriceFabrication).toBe(false);
    expect(report.conflict).toBeUndefined();
  });

  it('detects price fabrication outside the deterministic plan', () => {
    const json = JSON.stringify({
      consistent: true,
      consistencyExplanation: 'Looks fine.',
      bestArgumentFor: 'Strong move toward 75000 expected within hours.',
      bestArgumentAgainst: 'None.',
      invalidationCondition: 'Below 60000.',
      shouldWait: false,
      shouldWaitReason: 'Take it.',
      caveats: [],
    });
    const report = parseAuditorResponse(json, auditorInput);
    expect(report.detectedPriceFabrication).toBe(true);
  });

  it('flags AI-vs-engine conflict when AI suggests acting on a WAIT', () => {
    const waitInput = { ...auditorInput, signal: buildSignal({ action: 'WAIT' }) };
    const json = JSON.stringify({
      consistent: false,
      consistencyExplanation: 'I disagree with the engine.',
      bestArgumentFor: 'Bullish bias.',
      bestArgumentAgainst: 'None.',
      invalidationCondition: 'None.',
      shouldWait: false,
      shouldWaitReason: 'I would trade it.',
      caveats: [],
    });
    const report = parseAuditorResponse(json, waitInput);
    expect(report.conflict).toBeDefined();
    expect(report.conflict?.deterministicAction).toBe('WAIT');
  });

  it('throws on unparseable JSON', () => {
    expect(() => parseAuditorResponse('not json at all', auditorInput)).toThrow(
      AiAuditorParseError
    );
  });
});
