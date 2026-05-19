import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { tmpdir } from 'node:os';
import { describe, it, expect } from 'vitest';
import { cleanupScreenerStorage, exportJsonl, toCsv } from '../maintenance';

describe('screener maintenance', () => {
  it('cleanup removes old JSONL records, preserves recent records, and drops corrupt lines', async () => {
    const dir = await fs.mkdtemp(path.join(tmpdir(), 'screener-maint-'));
    const now = Date.now();

    await fs.writeFile(path.join(dir, 'history.jsonl'), [
      JSON.stringify({ ts: now - 100 * 86_400_000, status: 'completed', evaluatedSymbols: 1, failedSymbols: 0, topSymbol: 'OLD', topAction: 'LONG', topScore: 1 }),
      'not-json',
      JSON.stringify({ ts: now - 1_000, status: 'completed', evaluatedSymbols: 1, failedSymbols: 0, topSymbol: 'NEW', topAction: 'LONG', topScore: 2 }),
    ].join('\n') + '\n');

    await fs.writeFile(path.join(dir, 'alerts.jsonl'), [
      JSON.stringify({ symbol: 'OLD', action: 'LONG', rankingScore: 1, confidence: 80, grade: 'A', entry: 1, stopLoss: 0.9, status: 'triggered', reason: 'old', createdAt: now - 40 * 86_400_000 }),
      '{bad',
      JSON.stringify({ symbol: 'NEW', action: 'LONG', rankingScore: 2, confidence: 80, grade: 'A', entry: 1, stopLoss: 0.9, status: 'triggered', reason: 'new', createdAt: now - 1_000 }),
    ].join('\n') + '\n');

    await fs.writeFile(path.join(dir, 'latest.json'), JSON.stringify({ keep: true }), 'utf8');
    await fs.writeFile(path.join(dir, 'settings.json'), JSON.stringify({ keep: true }), 'utf8');

    const report = await cleanupScreenerStorage(dir, { historyRetentionDays: 90, alertRetentionDays: 30 });

    expect(report.historyBefore).toBe(3);
    expect(report.historyAfter).toBe(1);
    expect(report.historyRemoved).toBe(1);
    expect(report.historyCorrupt).toBe(1);
    expect(report.alertsBefore).toBe(3);
    expect(report.alertsAfter).toBe(1);
    expect(report.alertsRemoved).toBe(1);
    expect(report.alertsCorrupt).toBe(1);

    const latest = await fs.readFile(path.join(dir, 'latest.json'), 'utf8');
    const settings = await fs.readFile(path.join(dir, 'settings.json'), 'utf8');
    expect(JSON.parse(latest).keep).toBe(true);
    expect(JSON.parse(settings).keep).toBe(true);

    const history = await exportJsonl<{ topSymbol: string }>(path.join(dir, 'history.jsonl'));
    const alerts = await exportJsonl<{ symbol: string }>(path.join(dir, 'alerts.jsonl'));
    expect(history).toHaveLength(1);
    expect(history[0]!.topSymbol).toBe('NEW');
    expect(alerts).toHaveLength(1);
    expect(alerts[0]!.symbol).toBe('NEW');
  });

  it('toCsv exports selected fields safely', () => {
    const csv = toCsv([
      { symbol: 'BTCUSDT', reason: 'clean setup' },
      { symbol: 'ETHUSDT', reason: 'contains,comma' },
    ], ['symbol', 'reason']);

    expect(csv).toContain('symbol,reason');
    expect(csv).toContain('BTCUSDT,clean setup');
    expect(csv).toContain('ETHUSDT,"contains,comma"');
  });
});
