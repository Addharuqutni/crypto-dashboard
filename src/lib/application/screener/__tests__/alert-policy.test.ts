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
    status: 'triggered',
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

  it('returns empty when alerts are disabled (no spam)', () => {
    const ranked = [makeRanked()];
    const decisions = evaluateAlertPolicy(ranked, {
      settings: DEFAULT_SCREENER_ALERT_SETTINGS, // enabled: false
      recentAlerts: [],
      now,
    });
    // No records produced at all — prevents history spam when disabled.
    expect(decisions).toHaveLength(0);
  });

  it('triggers eligible result when enabled', () => {
    const ranked = [makeRanked()];
    const decisions = evaluateAlertPolicy(ranked, {
      settings: enabledSettings,
      recentAlerts: [],
      now,
    });
    expect(decisions).toHaveLength(1);
    expect(decisions[0]!.shouldAlert).toBe(true);
    expect(decisions[0]!.reason).toBe('eligible');
    expect(decisions[0]!.record.status).toBe('triggered');
  });

  it('alert records never use "sent" status', () => {
    const ranked = [makeRanked()];
    const decisions = evaluateAlertPolicy(ranked, {
      settings: enabledSettings,
      recentAlerts: [],
      now,
    });
    for (const d of decisions) {
      expect(d.record.status).not.toBe('sent');
    }
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
    expect(decisions[0]!.record.status).toBe('skipped');
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
    expect(decisions[0]!.record.status).toBe('suppressed_cooldown');
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

  it('material change (entry changes >= 1%) overrides cooldown', () => {
    const ranked = [makeRanked({ entry: 106100 })]; // was 105000 -> ~1.05% change
    const recentAlerts = [makeAlertRecord({ entry: 105000, createdAt: now - 10 * 60_000 })];
    const decisions = evaluateAlertPolicy(ranked, {
      settings: enabledSettings,
      recentAlerts,
      now,
    });
    expect(decisions[0]!.shouldAlert).toBe(true);
  });

  it('material change (SL changes >= 1%) overrides cooldown', () => {
    const ranked = [makeRanked({ stopLoss: 101970 })]; // was 103000 -> ~1% change
    const recentAlerts = [makeAlertRecord({ stopLoss: 103000, createdAt: now - 10 * 60_000 })];
    const decisions = evaluateAlertPolicy(ranked, {
      settings: enabledSettings,
      recentAlerts,
      now,
    });
    expect(decisions[0]!.shouldAlert).toBe(true);
  });

  it('no material change keeps cooldown active', () => {
    const ranked = [makeRanked({ confidence: 86 })]; // was 85 — not +10
    const recentAlerts = [makeAlertRecord({ confidence: 85, createdAt: now - 10 * 60_000 })];
    const decisions = evaluateAlertPolicy(ranked, {
      settings: { ...enabledSettings, cooldownMinutes: 60 },
      recentAlerts,
      now,
    });
    expect(decisions[0]!.shouldAlert).toBe(false);
    expect(decisions[0]!.record.status).toBe('suppressed_cooldown');
  });

  it('respects maxAlertsPerHour cap counting only triggered', () => {
    const ranked = [
      makeRanked({ symbol: 'BTCUSDT' }),
      makeRanked({ symbol: 'ETHUSDT', rank: 2 }),
    ];
    // 3 triggered + 2 skipped in last hour
    const recentAlerts = [
      makeAlertRecord({ symbol: 'XRPUSDT', status: 'triggered', createdAt: now - 5 * 60_000 }),
      makeAlertRecord({ symbol: 'DOGEUSDT', status: 'triggered', createdAt: now - 4 * 60_000 }),
      makeAlertRecord({ symbol: 'AVAXUSDT', status: 'triggered', createdAt: now - 3 * 60_000 }),
      makeAlertRecord({ symbol: 'AAAUSDT', status: 'skipped', createdAt: now - 2 * 60_000 }),
      makeAlertRecord({ symbol: 'BBBUSDT', status: 'suppressed_cooldown', createdAt: now - 1 * 60_000 }),
    ];
    const decisions = evaluateAlertPolicy(ranked, {
      settings: { ...enabledSettings, maxAlertsPerHour: 3 },
      recentAlerts,
      now,
    });
    // Budget = 3 - 3 (triggered only) = 0
    const triggered = decisions.filter((d) => d.shouldAlert);
    expect(triggered.length).toBe(0);
    // Capped records use suppressed_hourly_cap status.
    expect(decisions[0]!.record.status).toBe('suppressed_hourly_cap');
  });

  it('hourly cap budget ignores skipped/suppressed records', () => {
    const ranked = [makeRanked({ symbol: 'BTCUSDT' })];
    // 5 non-triggered records — should NOT consume budget
    const recentAlerts = [
      makeAlertRecord({ symbol: 'XRPUSDT', status: 'skipped', createdAt: now - 5 * 60_000 }),
      makeAlertRecord({ symbol: 'DOGEUSDT', status: 'suppressed_cooldown', createdAt: now - 4 * 60_000 }),
      makeAlertRecord({ symbol: 'AVAXUSDT', status: 'suppressed_low_quality', createdAt: now - 3 * 60_000 }),
      makeAlertRecord({ symbol: 'AAAUSDT', status: 'suppressed_hourly_cap', createdAt: now - 2 * 60_000 }),
      makeAlertRecord({ symbol: 'BBBUSDT', status: 'expired', createdAt: now - 1 * 60_000 }),
    ];
    const decisions = evaluateAlertPolicy(ranked, {
      settings: { ...enabledSettings, maxAlertsPerHour: 3 },
      recentAlerts,
      now,
    });
    // Budget = 3 - 0 (no triggered) = 3, so BTCUSDT should pass
    expect(decisions[0]!.shouldAlert).toBe(true);
    expect(decisions[0]!.record.status).toBe('triggered');
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

  it('only looks at triggered alerts for cooldown (ignores skipped)', () => {
    const ranked = [makeRanked()];
    const recentAlerts = [makeAlertRecord({ status: 'skipped', createdAt: now - 10 * 60_000 })];
    const decisions = evaluateAlertPolicy(ranked, {
      settings: enabledSettings,
      recentAlerts,
      now,
    });
    expect(decisions[0]!.shouldAlert).toBe(true);
  });

  it('alerts disabled does not spam history', () => {
    const ranked = [
      makeRanked({ symbol: 'BTCUSDT' }),
      makeRanked({ symbol: 'ETHUSDT' }),
      makeRanked({ symbol: 'SOLUSDT' }),
    ];
    const decisions = evaluateAlertPolicy(ranked, {
      settings: { ...DEFAULT_SCREENER_ALERT_SETTINGS, enabled: false },
      recentAlerts: [],
      now,
    });
    // Zero records when disabled — no spam.
    expect(decisions).toHaveLength(0);
  });
});
