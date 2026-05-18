import { describe, it, expect } from 'vitest';
import { evaluateAlertPolicy } from '../alert-policy';
import type { RankedScreenerResult, ScreenerAlertSettings, ScreenerAlertRecord } from '../types';
import { DEFAULT_SCREENER_ALERT_SETTINGS } from '../config';

/**
 * Factory for a ranked result that passes all eligibility gates by default.
 */
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
    // Ranked fields
    rank: 1,
    rankingScore: 80,
    rankReason: ['Score: 80'],
    alertEligible: true,
    alertBlockReasons: [],
    ...overrides,
  };
}

function makeAlertRecord(overrides: Partial<ScreenerAlertRecord> = {}): ScreenerAlertRecord {
  return {
    symbol: 'BTCUSDT',
    action: 'LONG',
    rankingScore: 80,
    confidence: 85,
    grade: 'A',
    entry: 105000,
    stopLoss: 103000,
    status: 'sent',
    reason: 'eligible',
    createdAt: Date.now() - 30 * 60 * 1000, // 30 min ago
    ...overrides,
  };
}

const enabledSettings: ScreenerAlertSettings = {
  ...DEFAULT_SCREENER_ALERT_SETTINGS,
  enabled: true,
};

const now = Date.now();

describe('evaluateAlertPolicy', () => {
  it('returns empty for empty ranked list', () => {
    const decisions = evaluateAlertPolicy([], {
      settings: enabledSettings,
      recentAlerts: [],
      now,
    });
    expect(decisions).toHaveLength(0);
  });

  it('skips all when alerts are disabled', () => {
    const ranked = [makeRanked()];
    const decisions = evaluateAlertPolicy(ranked, {
      settings: DEFAULT_SCREENER_ALERT_SETTINGS, // enabled: false
      recentAlerts: [],
      now,
    });
    expect(decisions).toHaveLength(1);
    expect(decisions[0]!.shouldAlert).toBe(false);
    expect(decisions[0]!.reason).toBe('alerts_disabled');
  });

  it('alerts eligible result when enabled', () => {
    const ranked = [makeRanked()];
    const decisions = evaluateAlertPolicy(ranked, {
      settings: enabledSettings,
      recentAlerts: [],
      now,
    });
    expect(decisions).toHaveLength(1);
    expect(decisions[0]!.shouldAlert).toBe(true);
    expect(decisions[0]!.reason).toBe('eligible');
    expect(decisions[0]!.record.status).toBe('sent');
  });

  it('skips WAIT when sendWaitAlerts is false', () => {
    const ranked = [makeRanked({ action: 'WAIT', alertEligible: true })];
    const decisions = evaluateAlertPolicy(ranked, {
      settings: enabledSettings,
      recentAlerts: [],
      now,
    });
    expect(decisions[0]!.shouldAlert).toBe(false);
    expect(decisions[0]!.reason).toBe('wait_disabled');
  });

  it('respects cooldown suppression', () => {
    const ranked = [makeRanked()];
    const recentAlerts = [makeAlertRecord({ createdAt: now - 10 * 60_000 })]; // 10 min ago
    const decisions = evaluateAlertPolicy(ranked, {
      settings: { ...enabledSettings, cooldownMinutes: 60 },
      recentAlerts,
      now,
    });
    expect(decisions[0]!.shouldAlert).toBe(false);
    expect(decisions[0]!.reason).toBe('cooldown_active');
  });

  it('allows alert after cooldown expires', () => {
    const ranked = [makeRanked()];
    const recentAlerts = [makeAlertRecord({ createdAt: now - 90 * 60_000 })]; // 90 min ago
    const decisions = evaluateAlertPolicy(ranked, {
      settings: enabledSettings,
      recentAlerts,
      now,
    });
    expect(decisions[0]!.shouldAlert).toBe(true);
  });

  it('material change (confidence +10) overrides cooldown', () => {
    const ranked = [makeRanked({ confidence: 95 })]; // was 85 in alert
    const recentAlerts = [makeAlertRecord({ confidence: 85, createdAt: now - 10 * 60_000 })];
    const decisions = evaluateAlertPolicy(ranked, {
      settings: enabledSettings,
      recentAlerts,
      now,
    });
    expect(decisions[0]!.shouldAlert).toBe(true);
  });

  it('material change (grade improvement) overrides cooldown', () => {
    const ranked = [makeRanked({ grade: 'A' })];
    const recentAlerts = [makeAlertRecord({ grade: 'B', createdAt: now - 10 * 60_000 })];
    const decisions = evaluateAlertPolicy(ranked, {
      settings: enabledSettings,
      recentAlerts,
      now,
    });
    expect(decisions[0]!.shouldAlert).toBe(true);
  });

  it('respects maxAlertsPerHour cap', () => {
    const ranked = [
      makeRanked({ symbol: 'BTCUSDT' }),
      makeRanked({ symbol: 'ETHUSDT', rank: 2 }),
      makeRanked({ symbol: 'SOLUSDT', rank: 3 }),
      makeRanked({ symbol: 'ADAUSDT', rank: 4 }),
    ];
    // 3 alerts already sent this hour
    const recentAlerts = [
      makeAlertRecord({ symbol: 'XRPUSDT', createdAt: now - 5 * 60_000 }),
      makeAlertRecord({ symbol: 'DOGEUSDT', createdAt: now - 4 * 60_000 }),
      makeAlertRecord({ symbol: 'AVAXUSDT', createdAt: now - 3 * 60_000 }),
    ];
    const decisions = evaluateAlertPolicy(ranked, {
      settings: { ...enabledSettings, maxAlertsPerHour: 3 },
      recentAlerts,
      now,
    });
    const sent = decisions.filter((d) => d.shouldAlert);
    expect(sent.length).toBe(0); // budget = 3 - 3 = 0
  });

  it('caps results to topNOnly', () => {
    const ranked = [
      makeRanked({ symbol: 'BTCUSDT', rank: 1 }),
      makeRanked({ symbol: 'ETHUSDT', rank: 2 }),
      makeRanked({ symbol: 'SOLUSDT', rank: 3 }),
      makeRanked({ symbol: 'ADAUSDT', rank: 4 }),
    ];
    const decisions = evaluateAlertPolicy(ranked, {
      settings: { ...enabledSettings, topNOnly: 2 },
      recentAlerts: [],
      now,
    });
    expect(decisions).toHaveLength(2);
  });

  it('only looks at sent alerts for cooldown (ignores skipped)', () => {
    const ranked = [makeRanked()];
    const recentAlerts = [makeAlertRecord({ status: 'skipped', createdAt: now - 10 * 60_000 })];
    const decisions = evaluateAlertPolicy(ranked, {
      settings: enabledSettings,
      recentAlerts,
      now,
    });
    expect(decisions[0]!.shouldAlert).toBe(true);
  });
});
