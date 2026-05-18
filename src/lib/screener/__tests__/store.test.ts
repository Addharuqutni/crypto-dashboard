import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { ScreenerStore } from '../store';
import type { ScreenerLatestRun, ScreenerHistoryEntry } from '../store';
import type { ScreenerAlertRecord, ScreenerAlertSettings } from '../types';
import { DEFAULT_SCREENER_ALERT_SETTINGS } from '../config';

const TEST_DIR = path.join(process.cwd(), 'data', 'screener-test-' + process.pid);

let store: ScreenerStore;

beforeEach(async () => {
  store = new ScreenerStore(TEST_DIR);
  await store.init();
});

afterEach(async () => {
  try {
    await fs.rm(TEST_DIR, { recursive: true, force: true });
  } catch {
    // tolerate cleanup failures
  }
});

function makeLatest(): ScreenerLatestRun {
  const now = Date.now();
  return {
    completedAt: now,
    health: {
      status: 'completed',
      startedAt: now - 1000,
      completedAt: now,
      evaluatedSymbols: 10,
      failedSymbols: 0,
      errors: [],
    },
    results: [],
    timeframes: { setup: '30m', trigger: '15m', macro: '4h' },
    universeSize: 10,
  };
}

function makeAlert(overrides: Partial<ScreenerAlertRecord> = {}): ScreenerAlertRecord {
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
    createdAt: Date.now(),
    ...overrides,
  };
}

describe('ScreenerStore', () => {
  describe('latest', () => {
    it('returns null when no latest exists', async () => {
      expect(await store.readLatest()).toBeNull();
    });

    it('writes and reads latest', async () => {
      const latest = makeLatest();
      await store.writeLatest(latest);
      const read = await store.readLatest();
      expect(read).not.toBeNull();
      expect(read!.completedAt).toBe(latest.completedAt);
      expect(read!.universeSize).toBe(10);
    });

    it('overwrites latest atomically', async () => {
      await store.writeLatest(makeLatest());
      const updated = makeLatest();
      updated.universeSize = 5;
      await store.writeLatest(updated);
      const read = await store.readLatest();
      expect(read!.universeSize).toBe(5);
    });
  });

  describe('history', () => {
    it('returns empty when no history exists', async () => {
      expect(await store.readRecentHistory()).toEqual([]);
    });

    it('appends and reads history entries', async () => {
      const entry: ScreenerHistoryEntry = {
        ts: Date.now(),
        status: 'completed',
        evaluatedSymbols: 10,
        failedSymbols: 0,
        topSymbol: 'BTCUSDT',
        topAction: 'LONG',
        topScore: 80,
      };
      await store.appendHistory(entry);
      await store.appendHistory({ ...entry, ts: Date.now() + 1000 });
      const read = await store.readRecentHistory();
      expect(read).toHaveLength(2);
    });

    it('limits returned entries', async () => {
      for (let i = 0; i < 5; i++) {
        await store.appendHistory({
          ts: Date.now() + i,
          status: 'completed',
          evaluatedSymbols: 10,
          failedSymbols: 0,
          topSymbol: null,
          topAction: null,
          topScore: null,
        });
      }
      const read = await store.readRecentHistory(3);
      expect(read).toHaveLength(3);
    });
  });

  describe('settings', () => {
    it('returns defaults when no settings file exists', async () => {
      const settings = await store.readSettings();
      expect(settings.enabled).toBe(DEFAULT_SCREENER_ALERT_SETTINGS.enabled);
      expect(settings.minConfidence).toBe(DEFAULT_SCREENER_ALERT_SETTINGS.minConfidence);
    });

    it('writes and reads settings', async () => {
      const custom: ScreenerAlertSettings = {
        ...DEFAULT_SCREENER_ALERT_SETTINGS,
        enabled: true,
        minConfidence: 90,
      };
      await store.writeSettings(custom);
      const read = await store.readSettings();
      expect(read.enabled).toBe(true);
      expect(read.minConfidence).toBe(90);
    });
  });

  describe('alerts', () => {
    it('returns empty when no alerts exist', async () => {
      expect(await store.readRecentAlerts()).toEqual([]);
    });

    it('appends and reads alerts', async () => {
      await store.appendAlert(makeAlert());
      await store.appendAlert(makeAlert({ symbol: 'ETHUSDT' }));
      const read = await store.readRecentAlerts();
      expect(read).toHaveLength(2);
      expect(read[0]!.symbol).toBe('BTCUSDT');
      expect(read[1]!.symbol).toBe('ETHUSDT');
    });

    it('limits returned alerts', async () => {
      for (let i = 0; i < 5; i++) {
        await store.appendAlert(makeAlert({ createdAt: Date.now() + i }));
      }
      const read = await store.readRecentAlerts(2);
      expect(read).toHaveLength(2);
    });
  });
});
