import { beforeEach, describe, expect, it } from 'vitest';
import {
  applyPriceToEntry,
  computeFinalR,
  computeFinalRFromExit,
  useSignalJournalStore,
} from '../use-signal-journal-store';
import type { SignalJournalEntry } from '@/types/signal-journal';

/**
 * Signal Journal store + helper tests.
 *
 * We exercise pure helpers directly (price → entry projection, R math) and
 * the store's batched mutators via `getState()` so we don't need React.
 * localStorage is the jsdom default — we reset between tests.
 */

function baseEntry(overrides: Partial<SignalJournalEntry> = {}): SignalJournalEntry {
  return {
    id: 'TEST-1',
    symbol: 'BTC',
    timeframe: '30m',
    action: 'LONG',
    confidenceScore: 70,
    signalGrade: 'A',
    entryPrice: 100,
    stopLoss: 95,
    tp1: 105,
    tp2: 110,
    tp3: 115,
    createdAt: 1_700_000_000_000,
    status: 'PENDING',
    maxFavorableExcursion: null,
    maxAdverseExcursion: null,
    reasons: [],
    warnings: [],
    source: 'manual',
    finalR: null,
    ...overrides,
  };
}

function resetStore() {
  // Clear persisted state and in-memory entries.
  if (typeof localStorage !== 'undefined') localStorage.clear();
  useSignalJournalStore.setState({ entries: [], hydrated: true });
}

describe('applyPriceToEntry', () => {
  it('returns the same reference when nothing changes (PENDING with no prior excursion, price = entry)', () => {
    const e = baseEntry();
    const out = applyPriceToEntry(e, 100);
    // First call always sets MFE/MAE to 0 from null, so it WILL produce a new
    // object. But a follow-up call with the same price should be identity.
    const out2 = applyPriceToEntry(out, 100);
    expect(out2).toBe(out);
  });

  it('promotes LONG to SL when price drops below stop', () => {
    const e = baseEntry();
    const out = applyPriceToEntry(e, 94);
    expect(out.status).toBe('SL');
    expect(out.finalR).toBeCloseTo(-1, 4);
  });

  it('promotes LONG to TP2 when price reaches tp2', () => {
    const e = baseEntry();
    const out = applyPriceToEntry(e, 110);
    expect(out.status).toBe('TP2');
    expect(out.finalR).toBeCloseTo(2, 4);
  });

  it('prioritises TP3 when price reaches it directly', () => {
    const e = baseEntry();
    const out = applyPriceToEntry(e, 116);
    expect(out.status).toBe('TP3');
    expect(out.finalR).toBeCloseTo(3, 4);
  });

  it('SHORT: SL fires when price rises above stop', () => {
    const e = baseEntry({
      action: 'SHORT',
      entryPrice: 100,
      stopLoss: 105,
      tp1: 95,
      tp2: 90,
      tp3: 85,
    });
    const out = applyPriceToEntry(e, 106);
    expect(out.status).toBe('SL');
    expect(out.finalR).toBeCloseTo(-1, 4);
  });

  it('refuses to mutate a non-PENDING entry', () => {
    const e = baseEntry({ status: 'TP1', finalR: 1 });
    const out = applyPriceToEntry(e, 80);
    expect(out).toBe(e);
  });

  it('tracks MFE/MAE monotonically', () => {
    let e = baseEntry();
    e = applyPriceToEntry(e, 102); // +2 favor
    e = applyPriceToEntry(e, 98); // -2 adverse
    e = applyPriceToEntry(e, 100);
    expect(e.maxFavorableExcursion).toBe(2);
    expect(e.maxAdverseExcursion).toBe(2);
  });
});

describe('computeFinalR / computeFinalRFromExit', () => {
  it('LONG TP2 returns +2R when SL is 5 below entry and TP2 is 10 above', () => {
    const r = computeFinalR(baseEntry(), 'TP2');
    expect(r).toBeCloseTo(2, 4);
  });

  it('SL on a SHORT returns -1R', () => {
    const r = computeFinalR(
      baseEntry({ action: 'SHORT', entryPrice: 100, stopLoss: 105 }),
      'SL'
    );
    expect(r).toBeCloseTo(-1, 4);
  });

  it('EXPIRED returns 0 explicitly', () => {
    expect(computeFinalR(baseEntry(), 'EXPIRED')).toBe(0);
  });

  it('returns null when stop and entry are equal (rDist = 0)', () => {
    expect(computeFinalR(baseEntry({ stopLoss: 100 }), 'TP1')).toBeNull();
  });

  it('honours user-supplied actual exit price', () => {
    const r = computeFinalRFromExit(baseEntry(), 107.5);
    // 7.5 / 5 = 1.5R
    expect(r).toBeCloseTo(1.5, 4);
  });
});

describe('useSignalJournalStore', () => {
  beforeEach(() => resetStore());

  it('add() inserts a PENDING entry and assigns metadata defaults', () => {
    const created = useSignalJournalStore.getState().add({
      symbol: 'ETH',
      timeframe: '15m',
      action: 'LONG',
      confidenceScore: 65,
      signalGrade: 'B',
      entryPrice: 3000,
      stopLoss: 2950,
      tp1: 3050,
      tp2: 3100,
      tp3: 3150,
      reasons: [],
      warnings: [],
    });
    expect(created).not.toBeNull();
    expect(created!.status).toBe('PENDING');
    expect(created!.source).toBe('manual');
    expect(created!.finalR).toBeNull();
    expect(useSignalJournalStore.getState().entries).toHaveLength(1);
  });

  it('applyTickBatch() updates multiple entries in a single mutation', () => {
    const store = useSignalJournalStore.getState();
    store.add({
      symbol: 'BTC',
      timeframe: '30m',
      action: 'LONG',
      confidenceScore: 70,
      signalGrade: 'A',
      entryPrice: 100,
      stopLoss: 95,
      tp1: 105,
      tp2: 110,
      tp3: 115,
      reasons: [],
      warnings: [],
    });
    store.add({
      symbol: 'ETH',
      timeframe: '30m',
      action: 'SHORT',
      confidenceScore: 70,
      signalGrade: 'A',
      entryPrice: 200,
      stopLoss: 210,
      tp1: 190,
      tp2: 180,
      tp3: 170,
      reasons: [],
      warnings: [],
    });
    useSignalJournalStore.getState().applyTickBatch({ BTC: 110, ETH: 175 });
    const entries = useSignalJournalStore.getState().entries;
    // BTC LONG hits tp2=110. ETH SHORT entered at 200 with tp2=180, tp3=170:
    // price 175 has crossed tp2 but not tp3.
    expect(entries.find((e) => e.symbol === 'BTC')?.status).toBe('TP2');
    expect(entries.find((e) => e.symbol === 'ETH')?.status).toBe('TP2');
  });

  it('applyTickBatch() expires PENDING entries past their deadline', () => {
    useSignalJournalStore.getState().add({
      symbol: 'BTC',
      timeframe: '30m',
      action: 'LONG',
      confidenceScore: 70,
      signalGrade: 'A',
      entryPrice: 100,
      stopLoss: 95,
      tp1: 105,
      tp2: 110,
      tp3: 115,
      reasons: [],
      warnings: [],
      expiresAt: 1_000,
      source: 'paper',
    });
    useSignalJournalStore.getState().applyTickBatch({}, 5_000);
    const entry = useSignalJournalStore.getState().entries[0]!;
    expect(entry.status).toBe('EXPIRED');
    expect(entry.finalR).toBe(0);
  });

  it('markOutcome() with override exit price overrides canonical level', () => {
    useSignalJournalStore.getState().add({
      symbol: 'BTC',
      timeframe: '30m',
      action: 'LONG',
      confidenceScore: 70,
      signalGrade: 'A',
      entryPrice: 100,
      stopLoss: 95,
      tp1: 105,
      tp2: 110,
      tp3: 115,
      reasons: [],
      warnings: [],
    });
    const id = useSignalJournalStore.getState().entries[0]!.id;
    useSignalJournalStore.getState().markOutcome(id, 'TP1', 107.5);
    const entry = useSignalJournalStore.getState().entries[0]!;
    expect(entry.status).toBe('TP1');
    expect(entry.finalR).toBeCloseTo(1.5, 4); // 7.5 / 5 = 1.5R
  });

  it('markOutcome() refuses to overwrite an already-closed entry', () => {
    useSignalJournalStore.getState().add({
      symbol: 'BTC',
      timeframe: '30m',
      action: 'LONG',
      confidenceScore: 70,
      signalGrade: 'A',
      entryPrice: 100,
      stopLoss: 95,
      tp1: 105,
      tp2: 110,
      tp3: 115,
      reasons: [],
      warnings: [],
    });
    const id = useSignalJournalStore.getState().entries[0]!.id;
    useSignalJournalStore.getState().markOutcome(id, 'TP1');
    useSignalJournalStore.getState().markOutcome(id, 'SL');
    const entry = useSignalJournalStore.getState().entries[0]!;
    // Still TP1 — the second call was a no-op.
    expect(entry.status).toBe('TP1');
  });

  it('metrics() reports closed/open R correctly', () => {
    const store = useSignalJournalStore.getState();
    store.add({
      symbol: 'BTC',
      timeframe: '30m',
      action: 'LONG',
      confidenceScore: 70,
      signalGrade: 'A',
      entryPrice: 100,
      stopLoss: 95,
      tp1: 105,
      tp2: 110,
      tp3: 115,
      reasons: [],
      warnings: [],
    });
    store.add({
      symbol: 'ETH',
      timeframe: '30m',
      action: 'LONG',
      confidenceScore: 70,
      signalGrade: 'A',
      entryPrice: 200,
      stopLoss: 195,
      tp1: 205,
      tp2: 210,
      tp3: 215,
      reasons: [],
      warnings: [],
    });
    // Close one trade as TP2 (+2R), leave the other open.
    const ids = useSignalJournalStore.getState().entries.map((e) => e.id);
    useSignalJournalStore.getState().markOutcome(ids[0]!, 'TP2');
    const m = useSignalJournalStore.getState().metrics();
    expect(m.closed).toBe(1);
    expect(m.pending).toBe(1);
    expect(m.closedR).toBeCloseTo(2, 4);
    expect(m.averageR).toBeCloseTo(2, 4);
    expect(m.bestR).toBeCloseTo(2, 4);
    expect(m.worstR).toBeCloseTo(2, 4);
  });
});
