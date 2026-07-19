import { describe, it, expect } from 'vitest';
import { filterAndSort, canonicalLevel, formatDuration, formatR } from '../filter-and-sort';
import type { SignalJournalEntry } from '@/types/signal-journal';

function makeEntry(overrides: Partial<SignalJournalEntry> = {}): SignalJournalEntry {
  return {
    id: '1',
    symbol: 'BTC',
    timeframe: '4H',
    action: 'LONG',
    confidenceScore: 70,
    signalGrade: 'A',
    entryPrice: 65000,
    stopLoss: 63000,
    tp1: 67000,
    tp2: 69000,
    tp3: 72000,
    createdAt: 1000,
    status: 'PENDING',
    maxFavorableExcursion: null,
    maxAdverseExcursion: null,
    reasons: [],
    warnings: [],
    ...overrides,
  };
}

const baseArgs = {
  search: '',
  statusFilter: 'all' as const,
  sourceFilter: 'all' as const,
  sortKey: 'createdAt' as const,
  sortDir: 'desc' as const,
};

describe('filterAndSort', () => {
  it('returns empty for empty input', () => {
    expect(filterAndSort([], baseArgs)).toEqual([]);
  });

  it('passes all through with default args', () => {
    const entries = [makeEntry(), makeEntry({ id: '2' })];
    expect(filterAndSort(entries, baseArgs)).toHaveLength(2);
  });

  it('filter open returns only PENDING and CANCELLED', () => {
    const entries = [
      makeEntry({ id: '1', status: 'PENDING' }),
      makeEntry({ id: '2', status: 'CANCELLED' }),
      makeEntry({ id: '3', status: 'TP1' }),
      makeEntry({ id: '4', status: 'SL' }),
    ];
    const out = filterAndSort(entries, { ...baseArgs, statusFilter: 'open' });
    expect(out.map((e) => e.id)).toEqual(['1', '2']);
  });

  it('filter closed returns only TP/SL/EXPIRED', () => {
    const entries = [
      makeEntry({ id: '1', status: 'PENDING' }),
      makeEntry({ id: '2', status: 'TP1' }),
      makeEntry({ id: '3', status: 'TP2' }),
      makeEntry({ id: '4', status: 'TP3' }),
      makeEntry({ id: '5', status: 'SL' }),
      makeEntry({ id: '6', status: 'EXPIRED' }),
      makeEntry({ id: '7', status: 'CANCELLED' }),
    ];
    const out = filterAndSort(entries, { ...baseArgs, statusFilter: 'closed' });
    expect(out.map((e) => e.id)).toEqual(['2', '3', '4', '5', '6']);
  });

  it('filter by source manual', () => {
    const entries = [
      makeEntry({ id: '1', source: 'manual' }),
      makeEntry({ id: '2', source: 'paper' }),
      makeEntry({ id: '3' }), // no source defaults to manual
    ];
    const out = filterAndSort(entries, { ...baseArgs, sourceFilter: 'manual' });
    expect(out.map((e) => e.id)).toEqual(['1', '3']);
  });

  it('filter by source paper', () => {
    const entries = [
      makeEntry({ id: '1', source: 'manual' }),
      makeEntry({ id: '2', source: 'paper' }),
    ];
    const out = filterAndSort(entries, { ...baseArgs, sourceFilter: 'paper' });
    expect(out.map((e) => e.id)).toEqual(['2']);
  });

  it('search matches symbol', () => {
    const entries = [
      makeEntry({ id: '1', symbol: 'BTC' }),
      makeEntry({ id: '2', symbol: 'ETH' }),
    ];
    const out = filterAndSort(entries, { ...baseArgs, search: 'btc' });
    expect(out).toHaveLength(1);
    expect(out[0]!.id).toBe('1');
  });

  it('search matches setupType', () => {
    const entries = [
      makeEntry({ id: '1', setupType: 'LIQUIDITY_SWEEP' as never }),
      makeEntry({ id: '2', setupType: 'BREAKOUT' as never }),
    ];
    const out = filterAndSort(entries, { ...baseArgs, search: 'liquid' });
    expect(out).toHaveLength(1);
    expect(out[0]!.id).toBe('1');
  });

  it('sort by createdAt desc', () => {
    const entries = [
      makeEntry({ id: '1', createdAt: 1000 }),
      makeEntry({ id: '2', createdAt: 3000 }),
      makeEntry({ id: '3', createdAt: 2000 }),
    ];
    const out = filterAndSort(entries, { ...baseArgs, sortKey: 'createdAt', sortDir: 'desc' });
    expect(out.map((e) => e.id)).toEqual(['2', '3', '1']);
  });

  it('sort by createdAt asc', () => {
    const entries = [
      makeEntry({ id: '1', createdAt: 1000 }),
      makeEntry({ id: '2', createdAt: 3000 }),
      makeEntry({ id: '3', createdAt: 2000 }),
    ];
    const out = filterAndSort(entries, { ...baseArgs, sortKey: 'createdAt', sortDir: 'asc' });
    expect(out.map((e) => e.id)).toEqual(['1', '3', '2']);
  });

  it('sort by confidence desc', () => {
    const entries = [
      makeEntry({ id: '1', confidenceScore: 50 }),
      makeEntry({ id: '2', confidenceScore: 90 }),
      makeEntry({ id: '3', confidenceScore: 70 }),
    ];
    const out = filterAndSort(entries, { ...baseArgs, sortKey: 'confidence', sortDir: 'desc' });
    expect(out.map((e) => e.id)).toEqual(['2', '3', '1']);
  });

  it('sort by finalR desc pushes nulls to bottom', () => {
    const entries = [
      makeEntry({ id: '1', finalR: null }),
      makeEntry({ id: '2', finalR: 1.5 }),
      makeEntry({ id: '3', finalR: -0.5 }),
      makeEntry({ id: '4', finalR: null }),
    ];
    const out = filterAndSort(entries, { ...baseArgs, sortKey: 'finalR', sortDir: 'desc' });
    expect(out.map((e) => e.id)).toEqual(['2', '3', '1', '4']);
  });

  it('sort by finalR asc still pushes nulls to bottom', () => {
    const entries = [
      makeEntry({ id: '1', finalR: null }),
      makeEntry({ id: '2', finalR: 1.5 }),
      makeEntry({ id: '3', finalR: -0.5 }),
    ];
    const out = filterAndSort(entries, { ...baseArgs, sortKey: 'finalR', sortDir: 'asc' });
    expect(out.map((e) => e.id)).toEqual(['3', '2', '1']);
  });

  it('sort by finalR with both nulls is stable', () => {
    const entries = [
      makeEntry({ id: '1', finalR: null }),
      makeEntry({ id: '2', finalR: null }),
    ];
    const out = filterAndSort(entries, { ...baseArgs, sortKey: 'finalR', sortDir: 'desc' });
    expect(out.map((e) => e.id)).toEqual(['1', '2']);
  });
});

describe('canonicalLevel', () => {
  const entry = makeEntry({ tp1: 67000, tp2: 69000, tp3: 72000, stopLoss: 63000 });

  it('returns tp1 for TP1', () => {
    expect(canonicalLevel(entry, 'TP1')).toBe(67000);
  });

  it('returns tp2 for TP2', () => {
    expect(canonicalLevel(entry, 'TP2')).toBe(69000);
  });

  it('returns tp3 for TP3', () => {
    expect(canonicalLevel(entry, 'TP3')).toBe(72000);
  });

  it('returns stopLoss for SL', () => {
    expect(canonicalLevel(entry, 'SL')).toBe(63000);
  });

  it('returns null for EXPIRED', () => {
    expect(canonicalLevel(entry, 'EXPIRED')).toBeNull();
  });

  it('returns null when tp field is null', () => {
    const e = makeEntry({ tp1: null });
    expect(canonicalLevel(e, 'TP1')).toBeNull();
  });
});

describe('formatDuration', () => {
  it('formats minutes', () => {
    expect(formatDuration(5 * 60_000)).toBe('5m');
  });

  it('formats hours and minutes', () => {
    expect(formatDuration(90 * 60_000)).toBe('1h 30m');
  });

  it('formats days and hours', () => {
    expect(formatDuration(25 * 60 * 60_000)).toBe('1d 1h');
  });

  it('formats zero as 0m', () => {
    expect(formatDuration(0)).toBe('0m');
  });
});

describe('formatR', () => {
  it('formats positive R with +', () => {
    expect(formatR(1.5)).toBe('+1.50');
  });

  it('formats negative R without +', () => {
    expect(formatR(-0.75)).toBe('-0.75');
  });

  it('formats zero with +', () => {
    expect(formatR(0)).toBe('+0.00');
  });

  it('returns infinity symbol for non-finite', () => {
    expect(formatR(Infinity)).toBe('∞');
    expect(formatR(NaN)).toBe('∞');
  });
});
