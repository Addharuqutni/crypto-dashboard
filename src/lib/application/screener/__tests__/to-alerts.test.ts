import { describe, expect, it } from 'vitest';
import { displaySymbol, toAlertRecord, toAlertRecords } from '../to-alerts';

/**
 * The Alert History panel renders whatever this mapper returns, so the tests
 * focus on the two ways it can go wrong: showing a row the panel cannot
 * render, and silently dropping a row it could.
 */

function decision(overrides: Record<string, unknown> = {}) {
  return {
    symbol: 'BTC/USDT:USDT',
    action: 'LONG',
    status: 'triggered',
    reason: 'policy_pass',
    confidence: 82,
    grade: 'A',
    rankingScore: 71.5,
    entry: 65000,
    stopLoss: 64000,
    createdAt: 1_700_000_000_000,
    ...overrides,
  };
}

describe('displaySymbol', () => {
  it('drops the ccxt settle suffix', () => {
    expect(displaySymbol('BTC/USDT:USDT')).toBe('BTC/USDT');
    expect(displaySymbol('ETH/USDC:USDC')).toBe('ETH/USDC');
  });

  it('leaves a plain pair alone', () => {
    expect(displaySymbol('BTC/USDT')).toBe('BTC/USDT');
  });
});

describe('toAlertRecord', () => {
  it('maps a full decision into the panel contract', () => {
    const record = toAlertRecord(decision());

    expect(record).not.toBeNull();
    expect(record?.symbol).toBe('BTC/USDT');
    expect(record?.status).toBe('triggered');
    expect(record?.action).toBe('LONG');
    expect(record?.confidence).toBe(82);
    expect(record?.grade).toBe('A');
    expect(record?.rankingScore).toBe(71.5);
    expect(record?.entry).toBe(65000);
    expect(record?.stopLoss).toBe(64000);
    expect(record?.reason).toBe('policy_pass');
    expect(record?.createdAt).toBe(1_700_000_000_000);
  });

  it('keeps suppressed decisions, which the panel groups separately', () => {
    const record = toAlertRecord(decision({ status: 'suppressed_cooldown', reason: 'cooldown' }));
    expect(record?.status).toBe('suppressed_cooldown');
  });

  it('rejects an unknown status rather than rendering a blank badge', () => {
    expect(toAlertRecord(decision({ status: 'something_new' }))).toBeNull();
  });

  it('rejects an unknown action', () => {
    expect(toAlertRecord(decision({ action: 'HOLD' }))).toBeNull();
  });

  it('rejects a row missing the numbers the panel formats', () => {
    expect(toAlertRecord(decision({ confidence: undefined }))).toBeNull();
    expect(toAlertRecord(decision({ createdAt: undefined }))).toBeNull();
  });

  it('rejects a row missing symbol, status or action', () => {
    expect(toAlertRecord(decision({ symbol: undefined }))).toBeNull();
    expect(toAlertRecord(decision({ status: undefined }))).toBeNull();
    expect(toAlertRecord(decision({ action: undefined }))).toBeNull();
  });

  it('rejects non-objects and null', () => {
    expect(toAlertRecord(null)).toBeNull();
    expect(toAlertRecord('BTC/USDT')).toBeNull();
    expect(toAlertRecord(42)).toBeNull();
  });

  it('accepts a legacy row with no grade and defaults it to D', () => {
    const record = toAlertRecord(decision({ grade: undefined }));
    expect(record?.grade).toBe('D');
  });

  it('accepts a legacy row with no ranking score and defaults it to 0', () => {
    const record = toAlertRecord(decision({ rankingScore: undefined }));
    expect(record?.rankingScore).toBe(0);
  });

  it('coerces numeric strings, since JSON round-trips can stringify them', () => {
    const record = toAlertRecord(decision({ confidence: '82', rankingScore: '71.5' }));
    expect(record?.confidence).toBe(82);
    expect(record?.rankingScore).toBe(71.5);
  });

  it('leaves absent price levels as null rather than zero', () => {
    const record = toAlertRecord(decision({ entry: undefined, stopLoss: undefined }));
    expect(record?.entry).toBeNull();
    expect(record?.stopLoss).toBeNull();
  });
});

describe('toAlertRecords', () => {
  it('reverses engine order so the panel reversal lands on rank order', () => {
    // The engine emits best-ranked first; the panel reverses what it receives
    // before slicing, so it must be handed the opposite sequence.
    const records = toAlertRecords([
      decision({ symbol: 'BTC/USDT:USDT' }),
      decision({ symbol: 'ETH/USDT:USDT' }),
      decision({ symbol: 'SOL/USDT:USDT' }),
    ]);

    expect(records.map((r) => r.symbol)).toEqual(['SOL/USDT', 'ETH/USDT', 'BTC/USDT']);
  });

  it('puts the best-ranked decision last so the panel shows it first', () => {
    const records = toAlertRecords([
      decision({ symbol: 'BTC/USDT:USDT', rankingScore: 99 }),
      decision({ symbol: '1000BONK/USDT:USDT', rankingScore: 12 }),
    ]);

    const asPanelRenders = [...records].reverse();
    expect(asPanelRenders[0]?.symbol).toBe('BTC/USDT');
  });

  it('drops unrenderable rows without discarding the rest', () => {
    const records = toAlertRecords([
      decision({ symbol: 'BTC/USDT:USDT' }),
      decision({ status: 'bogus' }),
      decision({ symbol: 'SOL/USDT:USDT' }),
    ]);

    expect(records.map((r) => r.symbol)).toEqual(['SOL/USDT', 'BTC/USDT']);
  });

  it('returns an empty array for a missing or malformed field', () => {
    expect(toAlertRecords(undefined)).toEqual([]);
    expect(toAlertRecords(null)).toEqual([]);
    expect(toAlertRecords({})).toEqual([]);
    expect(toAlertRecords('nope')).toEqual([]);
  });

  it('returns an empty array for an empty cycle', () => {
    expect(toAlertRecords([])).toEqual([]);
  });
});
