import { describe, expect, it } from 'vitest';
import { computeJournalPnl } from '../pnl';
import type { SignalJournalEntry } from '@/types/signal-journal';

/**
 * Journal PnL helper tests.
 *
 * Cover the previously-tricky cases:
 *   - WAIT / CANCELLED → null (not 0%)
 *   - EXPIRED          → 0% with realized=true
 *   - Manual close with override exit price stays consistent with finalR
 *   - PENDING uses live price; missing live price → null
 *   - SHORT directionality flipped correctly
 *   - Defensive: missing entry price, missing SL, rDist=0
 */

function makeEntry(overrides: Partial<SignalJournalEntry> = {}): SignalJournalEntry {
  return {
    id: 'P-1',
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

describe('computeJournalPnl', () => {
  it('returns null for WAIT entries', () => {
    const out = computeJournalPnl(makeEntry({ action: 'WAIT' }), 105);
    expect(out.percent).toBeNull();
  });

  it('returns null for CANCELLED entries even when fully populated', () => {
    const out = computeJournalPnl(
      makeEntry({ status: 'CANCELLED', finalR: -1 }),
      105
    );
    expect(out.percent).toBeNull();
  });

  it('returns 0% (realised) for EXPIRED', () => {
    const out = computeJournalPnl(makeEntry({ status: 'EXPIRED', finalR: 0 }), 105);
    expect(out.percent).toBe(0);
    expect(out.realized).toBe(true);
  });

  it('PENDING uses live price (LONG)', () => {
    const out = computeJournalPnl(makeEntry(), 110);
    // (110 - 100) / 100 = 10%
    expect(out.percent).toBeCloseTo(10, 6);
    expect(out.realized).toBe(false);
  });

  it('PENDING SHORT inverts the delta', () => {
    const out = computeJournalPnl(
      makeEntry({ action: 'SHORT', entryPrice: 100, stopLoss: 105 }),
      90
    );
    expect(out.percent).toBeCloseTo(10, 6); // short profits when price falls
  });

  it('PENDING with no live price returns null', () => {
    const out = computeJournalPnl(makeEntry(), undefined);
    expect(out.percent).toBeNull();
  });

  it('TP2 closed without finalR falls back to canonical level', () => {
    const out = computeJournalPnl(
      makeEntry({ status: 'TP2', finalR: null }),
      undefined
    );
    // (110 - 100) / 100 = 10%
    expect(out.percent).toBeCloseTo(10, 6);
    expect(out.realized).toBe(true);
  });

  it('TP1 closed with override exit price prefers finalR over canonical', () => {
    // entry=100, SL=95 → rDist=5. finalR=1.5 means actual exit = 107.5,
    // not the canonical TP1=105. Percent should reflect that.
    const out = computeJournalPnl(
      makeEntry({ status: 'TP1', finalR: 1.5 }),
      undefined
    );
    // percent = finalR * rDist / entryPrice * 100 = 1.5 * 5 / 100 * 100 = 7.5%
    expect(out.percent).toBeCloseTo(7.5, 6);
    expect(out.realized).toBe(true);
  });

  it('SL closed with override exit price (deeper SL hit)', () => {
    // finalR = -1.2 → exit was 6 below entry, not the 5-point canonical SL.
    const out = computeJournalPnl(
      makeEntry({ status: 'SL', finalR: -1.2 }),
      undefined
    );
    expect(out.percent).toBeCloseTo(-6, 6);
    expect(out.realized).toBe(true);
  });

  it('returns null when entry price is missing', () => {
    const out = computeJournalPnl(makeEntry({ entryPrice: null }), 105);
    expect(out.percent).toBeNull();
  });

  it('returns null when entry price is non-positive (corrupt data)', () => {
    const out = computeJournalPnl(makeEntry({ entryPrice: 0 }), 105);
    expect(out.percent).toBeNull();
  });

  it('falls back to canonical level when finalR present but stop loss missing', () => {
    const out = computeJournalPnl(
      makeEntry({ status: 'TP1', finalR: 1, stopLoss: null }),
      undefined
    );
    // rDist can't be computed; canonical TP1 = 105 → +5%
    expect(out.percent).toBeCloseTo(5, 6);
  });

  it('returns null on closed status with no canonical level and no finalR', () => {
    const out = computeJournalPnl(
      makeEntry({ status: 'TP3', tp3: null, finalR: null }),
      undefined
    );
    expect(out.percent).toBeNull();
  });
});
