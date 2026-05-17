import { describe, expect, it } from 'vitest';
import { loadWorkerConfig, validateWorkerConfig } from '@/lib/worker/config';
import { decide, decideHealthAlert, makeRecord } from '@/lib/worker/dedupe';
import { formatHealthAlert, formatTradeAlert } from '@/lib/worker/formatter';
import { recordAlert } from '@/lib/worker/store';
import { sendTelegramMessage } from '@/lib/worker/telegram';
import type {
  AlertDedupeState,
  WorkerConfig,
} from '@/lib/worker/types';
import type { FuturesSignal } from '@/types/futures-signal';

/**
 * Phase 3 worker tests. Cover the contracts that prevent the worker from
 * spamming Telegram, leaking secrets, or crashing on transient errors.
 *
 * Pure-logic only — no disk, no network. The orchestrator's wiring is
 * exercised separately via `RunCycleDeps` injection (covered by an
 * integration test in this same file).
 */

const NOW = 1_700_000_000_000;

function buildSignal(overrides: Partial<FuturesSignal> = {}): FuturesSignal {
  return {
    action: 'LONG',
    confidenceScore: 80,
    signalGrade: 'A',
    entryTrigger: 'BREAKOUT',
    regime: 'BULLISH_TREND',
    entryZone: { min: 100, max: 100.5 },
    stopLoss: 95,
    takeProfits: { tp1: 105, tp2: 110, tp3: 115 },
    riskRewardRatio: 2,
    suggestedLeverage: { min: 1, max: 3 },
    riskLevel: 'LOW',
    invalidationReason: 'price below SL',
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

function buildConfig(overrides: Partial<WorkerConfig> = {}): WorkerConfig {
  return {
    symbols: ['BTCUSDT'],
    setupTimeframe: '30m',
    macroTimeframe: '4h',
    triggerTimeframe: '15m',
    intervalMinutes: 15,
    alertCooldownMinutes: 60,
    minConfidenceToAlert: 65,
    sendWaitAlerts: false,
    sendHealthAlerts: true,
    healthAlertsPerHour: 1,
    dataDir: './tmp-data',
    telegram: { botToken: 'test-token', chatId: '12345' },
    continueOnTelegramFailure: true,
    ...overrides,
  };
}

describe('config loader', () => {
  it('reads symbols, intervals, and booleans from env', () => {
    const cfg = loadWorkerConfig({
      WORKER_SYMBOLS: 'btcusdt,ethusdt',
      WORKER_INTERVAL_MIN: '30',
      WORKER_MIN_CONFIDENCE: '70',
      WORKER_ALERT_COOLDOWN_MIN: '90',
      WORKER_SEND_WAIT_ALERTS: 'true',
      WORKER_SEND_HEALTH_ALERTS: 'false',
      WORKER_DATA_DIR: '/tmp/x',
      TELEGRAM_BOT_TOKEN: 'tok',
      TELEGRAM_CHAT_ID: 'chat',
    });
    expect(cfg.symbols).toEqual(['BTCUSDT', 'ETHUSDT']);
    expect(cfg.intervalMinutes).toBe(30);
    expect(cfg.minConfidenceToAlert).toBe(70);
    expect(cfg.alertCooldownMinutes).toBe(90);
    expect(cfg.sendWaitAlerts).toBe(true);
    expect(cfg.sendHealthAlerts).toBe(false);
    expect(cfg.dataDir).toBe('/tmp/x');
    expect(cfg.telegram.botToken).toBe('tok');
    expect(cfg.telegram.chatId).toBe('chat');
  });

  it('rejects invalid symbols at validation time', () => {
    const cfg = loadWorkerConfig({}, { symbols: ['btc'] });
    const problems = validateWorkerConfig(cfg);
    expect(problems.some((p) => p.includes('btc'))).toBe(true);
  });
});

describe('alert deduper', () => {
  it('emits the first signal for a key', () => {
    const decision = decide('BTCUSDT', buildSignal(), buildConfig(), {});
    expect(decision.emit).toBe(true);
    expect(decision.reason).toBe('first_emit');
  });

  it('suppresses an identical re-emit inside the cooldown', () => {
    const cfg = buildConfig();
    const sig = buildSignal();
    const state: AlertDedupeState = {};
    const first = decide('BTCUSDT', sig, cfg, state, NOW);
    const after = recordAlert(state, makeRecord('BTCUSDT', sig, NOW));
    expect(first.emit).toBe(true);
    const second = decide('BTCUSDT', sig, cfg, after, NOW + 30 * 60_000);
    expect(second.emit).toBe(false);
    expect(second.reason).toBe('no_change');
  });

  it('re-emits inside the cooldown when grade improves', () => {
    const cfg = buildConfig();
    const initial = buildSignal({ signalGrade: 'B', grade: 'B', confidenceScore: 65, confidence: 65 });
    const after = recordAlert({}, makeRecord('BTCUSDT', initial, NOW));
    const upgraded = buildSignal({ signalGrade: 'A', grade: 'A' });
    const decision = decide('BTCUSDT', upgraded, cfg, after, NOW + 5 * 60_000);
    expect(decision.emit).toBe(true);
    expect(decision.reason).toBe('state_changed');
  });

  it('refuses directional alerts below minConfidenceToAlert', () => {
    const cfg = buildConfig({ minConfidenceToAlert: 70 });
    const decision = decide('BTCUSDT', buildSignal({ confidenceScore: 60, confidence: 60 }), cfg, {});
    expect(decision.emit).toBe(false);
    expect(decision.reason).toBe('below_min_confidence');
  });

  it('drops WAIT alerts when sendWaitAlerts is false', () => {
    const cfg = buildConfig({ sendWaitAlerts: false });
    const decision = decide('BTCUSDT', buildSignal({ action: 'WAIT' }), cfg, {});
    expect(decision.emit).toBe(false);
    expect(decision.reason).toBe('wait_disabled');
  });

  it('rate-limits health alerts per hour', () => {
    const cfg = buildConfig({ healthAlertsPerHour: 1 });
    const first = decideHealthAlert('binance_http_500', cfg, {}, NOW);
    expect(first.allow).toBe(true);
    const second = decideHealthAlert('binance_http_500', cfg, first.next, NOW + 30 * 60_000);
    expect(second.allow).toBe(false);
    const later = decideHealthAlert('binance_http_500', cfg, second.next, NOW + 65 * 60_000);
    expect(later.allow).toBe(true);
  });
});

describe('telegram client', () => {
  it('returns disabled when credentials are missing', async () => {
    const cfg = buildConfig({
      telegram: { botToken: null, chatId: null },
    });
    const result = await sendTelegramMessage('hello', cfg, {
      fetch: () => {
        throw new Error('should not be called');
      },
      sleep: async () => undefined,
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('disabled');
  });

  it('retries on 5xx and succeeds when a later attempt is OK', async () => {
    let calls = 0;
    const fakeFetch: typeof fetch = async () => {
      calls++;
      if (calls < 3) {
        return new Response('error', { status: 503 });
      }
      return new Response('{"ok":true}', { status: 200 });
    };
    const result = await sendTelegramMessage('msg', buildConfig(), {
      fetch: fakeFetch,
      sleep: async () => undefined,
    });
    expect(result.ok).toBe(true);
    expect(result.attempts).toBe(3);
  });

  it('treats 4xx as terminal and stops retrying', async () => {
    let calls = 0;
    const fakeFetch: typeof fetch = async () => {
      calls++;
      return new Response('Bad Request', { status: 400 });
    };
    const result = await sendTelegramMessage('msg', buildConfig(), {
      fetch: fakeFetch,
      sleep: async () => undefined,
    });
    expect(result.ok).toBe(false);
    expect(calls).toBe(1);
  });
});

describe('formatters', () => {
  it('produces the spec-shaped trade alert', () => {
    const text = formatTradeAlert({
      symbol: 'BTCUSDT',
      setupTimeframe: '30m',
      macroTimeframe: '4h',
      signal: buildSignal(),
    });
    expect(text).toContain('Action:* LONG');
    expect(text).toContain('Confidence:* 80');
    expect(text).toContain('Grade:* A');
    expect(text).toContain('Setup:');
    expect(text).toContain('Risk:');
    expect(text).toContain('Reason:');
    expect(text).toContain('Next step:');
    expect(text).toContain('SL:');
    expect(text).toContain('TP:');
  });

  it('formats a health-warning message with consecutive errors', () => {
    const text = formatHealthAlert({
      symbol: 'BTCUSDT',
      reason: 'binance HTTP 503',
      consecutiveErrors: 3,
      lastSuccessAt: null,
    });
    expect(text).toContain('Worker health warning');
    expect(text).toContain('Consecutive errors:* 3');
    expect(text).toContain('Last success:* never');
  });
});
