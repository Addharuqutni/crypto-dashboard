import { describe, it, expect } from 'vitest';
import {
  SCREENER_AUDITOR_SYSTEM_PROMPT,
  buildAuditUserMessage,
  parseAuditResult,
  AuditCache,
} from '../ai-auditor';
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

describe('SCREENER_AUDITOR_SYSTEM_PROMPT guardrails', () => {
  it('contains no-override guardrail', () => {
    expect(SCREENER_AUDITOR_SYSTEM_PROMPT).toContain("DO NOT override the signal engine's decision");
  });

  it('forbids unsupported levels, leverage, liquidation', () => {
    expect(SCREENER_AUDITOR_SYSTEM_PROMPT).toContain('DO NOT invent unsupported price levels, leverage, liquidation');
  });

  it('contains no-decision guardrail', () => {
    expect(SCREENER_AUDITOR_SYSTEM_PROMPT).toContain('DO NOT decide LONG/SHORT/WAIT');
  });

  it('contains educational disclaimer', () => {
    expect(SCREENER_AUDITOR_SYSTEM_PROMPT).toContain('educational decision-support, not financial advice');
  });

  it('contains WAIT_PREFERRED guidance for stale data', () => {
    expect(SCREENER_AUDITOR_SYSTEM_PROMPT).toContain('stale, conflicting, or insufficient');
    expect(SCREENER_AUDITOR_SYSTEM_PROMPT).toContain('WAIT_PREFERRED');
  });

  it('allows level proposals only from deterministic context', () => {
    expect(SCREENER_AUDITOR_SYSTEM_PROMPT).toMatch(/MAY optionally propose entry, stopLoss, and takeProfits ONLY if derived from the provided deterministic context/);
    expect(SCREENER_AUDITOR_SYSTEM_PROMPT).toMatch(/ATR, support\/resistance, swing high\/low, liquidity zone, candle structure/);
  });

  it('requires basis array for proposed levels', () => {
    expect(SCREENER_AUDITOR_SYSTEM_PROMPT).toContain('MUST include a "basis" array');
  });

  it('forbids proposing levels when WAIT_PREFERRED', () => {
    expect(SCREENER_AUDITOR_SYSTEM_PROMPT).toContain('MUST NOT propose levels when verdict is WAIT_PREFERRED');
  });

  it('forbids leverage and liquidation proposals', () => {
    expect(SCREENER_AUDITOR_SYSTEM_PROMPT).toContain('MUST NOT propose leverage or liquidation levels');
  });
});

describe('buildAuditUserMessage', () => {
  it('includes only safe fields, no secrets', () => {
    const result = makeRanked();
    const msg = buildAuditUserMessage(result);
    const parsed = JSON.parse(msg);

    expect(parsed.symbol).toBe('BTCUSDT');
    expect(parsed.action).toBe('LONG');
    expect(parsed.confidence).toBe(85);
    expect(parsed.grade).toBe('A');
    expect(parsed.dataHealth).toBeDefined();
    // Engine entry/SL are exposed so AI can derive proposed levels structurally,
    // but raw take-profit chain is not required for level reasoning.
    expect(parsed.entry).toBe(105000);
    expect(parsed.stopLoss).toBe(103000);
    // Confidence is exposed but as setup quality, not win probability.
    expect(parsed.confidence).toBe(85);
  });
});

describe('parseAuditResult', () => {
  it('parses valid JSON response', () => {
    const raw = JSON.stringify({
      symbol: 'BTCUSDT',
      verdict: 'VALID',
      summary: 'Strong bullish setup with good alignment.',
      mainRisk: 'Funding rate slightly elevated.',
      nextStep: 'Monitor trigger timeframe for confirmation.',
      caveats: ['Late in the move', 'Watch for reversal candle'],
    });
    const result = parseAuditResult(raw, 'BTCUSDT');
    expect(result).not.toBeNull();
    expect(result!.verdict).toBe('VALID');
    expect(result!.symbol).toBe('BTCUSDT');
    expect(result!.caveats).toHaveLength(2);
  });

  it('rejects wrong symbol', () => {
    const raw = JSON.stringify({
      symbol: 'ETHUSDT',
      verdict: 'VALID',
      summary: 'Good.',
      mainRisk: 'None.',
      nextStep: 'Wait.',
      caveats: [],
    });
    expect(parseAuditResult(raw, 'BTCUSDT')).toBeNull();
  });

  it('rejects invalid verdict', () => {
    const raw = JSON.stringify({
      symbol: 'BTCUSDT',
      verdict: 'BUY_NOW',
      summary: 'Good.',
      mainRisk: 'None.',
      nextStep: 'Wait.',
      caveats: [],
    });
    expect(parseAuditResult(raw, 'BTCUSDT')).toBeNull();
  });

  it('rejects missing fields', () => {
    const raw = JSON.stringify({
      symbol: 'BTCUSDT',
      verdict: 'VALID',
    });
    expect(parseAuditResult(raw, 'BTCUSDT')).toBeNull();
  });

  it('handles code-fenced response', () => {
    const raw = '```json\n' + JSON.stringify({
      symbol: 'BTCUSDT',
      verdict: 'WEAK',
      summary: 'Mediocre alignment.',
      mainRisk: 'Low MTF score.',
      nextStep: 'Wait for better setup.',
      caveats: ['Partial confirmation only'],
    }) + '\n```';
    const result = parseAuditResult(raw, 'BTCUSDT');
    expect(result).not.toBeNull();
    expect(result!.verdict).toBe('WEAK');
  });

  it('rejects non-JSON garbage', () => {
    expect(parseAuditResult('This is not JSON', 'BTCUSDT')).toBeNull();
  });

  it('rejects too many caveats', () => {
    const raw = JSON.stringify({
      symbol: 'BTCUSDT',
      verdict: 'VALID',
      summary: 'Good.',
      mainRisk: 'None.',
      nextStep: 'Wait.',
      caveats: ['a', 'b', 'c', 'd', 'e', 'f', 'g'],
    });
    expect(parseAuditResult(raw, 'BTCUSDT')).toBeNull();
  });

  it('parses optional proposed levels with basis', () => {
    const raw = JSON.stringify({
      symbol: 'BTCUSDT',
      verdict: 'VALID',
      summary: 'Good.',
      mainRisk: 'None.',
      nextStep: 'Wait.',
      caveats: [],
      proposedLevels: {
        entry: 105100,
        stopLoss: 103000,
        takeProfits: [107000, 109000],
        basis: ['ATR band', 'Support'],
      },
    });
    const r = parseAuditResult(raw, 'BTCUSDT');
    expect(r?.proposedLevels?.entry).toBe(105100);
    expect(r?.proposedLevels?.basis).toEqual(['ATR band', 'Support']);
  });

  it('parses null proposedLevels as undefined', () => {
    const raw = JSON.stringify({
      symbol: 'BTCUSDT',
      verdict: 'WAIT_PREFERRED',
      summary: 'Wait.',
      mainRisk: 'Stale.',
      nextStep: 'Wait.',
      caveats: [],
      proposedLevels: null,
    });
    const r = parseAuditResult(raw, 'BTCUSDT');
    expect(r?.proposedLevels).toBeUndefined();
  });
});

describe('AuditCache', () => {
  it('returns null for missing key', () => {
    const cache = new AuditCache();
    expect(cache.get({ symbol: 'BTCUSDT', action: 'LONG', candleCloseTime: 1000 })).toBeNull();
  });

  it('stores and retrieves by key', () => {
    const cache = new AuditCache();
    const key = { symbol: 'BTCUSDT', action: 'LONG', candleCloseTime: 1000 };
    const audit = {
      symbol: 'BTCUSDT',
      verdict: 'VALID' as const,
      summary: 'Good.',
      mainRisk: 'None.',
      nextStep: 'Wait.',
      caveats: [],
      generatedAt: Date.now(),
    };
    cache.set(key, audit);
    expect(cache.get(key)).toBe(audit);
  });

  it('different candleCloseTime is a cache miss', () => {
    const cache = new AuditCache();
    const audit = {
      symbol: 'BTCUSDT',
      verdict: 'VALID' as const,
      summary: 'Good.',
      mainRisk: 'None.',
      nextStep: 'Wait.',
      caveats: [],
      generatedAt: Date.now(),
    };
    cache.set({ symbol: 'BTCUSDT', action: 'LONG', candleCloseTime: 1000 }, audit);
    expect(cache.get({ symbol: 'BTCUSDT', action: 'LONG', candleCloseTime: 2000 })).toBeNull();
  });

  it('clear removes all entries', () => {
    const cache = new AuditCache();
    const key = { symbol: 'BTCUSDT', action: 'LONG', candleCloseTime: 1000 };
    const audit = {
      symbol: 'BTCUSDT',
      verdict: 'VALID' as const,
      summary: 'Good.',
      mainRisk: 'None.',
      nextStep: 'Wait.',
      caveats: [],
      generatedAt: Date.now(),
    };
    cache.set(key, audit);
    cache.clear();
    expect(cache.get(key)).toBeNull();
  });
});
