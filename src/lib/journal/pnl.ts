import type { SignalJournalEntry } from '@/types/signal-journal';

/**
 * Journal PnL helpers.
 *
 * Why this is a dedicated module:
 *   - PnL is consumed by the panel cards and (eventually) by exports and
 *     analytics. Centralising the math prevents drift between callers.
 *   - It needs to be deterministic and unit-testable: the logic has several
 *     edge cases (WAIT, CANCELLED, EXPIRED, manual override exit, missing
 *     live price, missing stop loss) that we want to lock down with tests.
 *
 * Single source of truth:
 *   For closed entries we prefer `entry.finalR` over recomputing from the
 *   canonical TP/SL level. The store writes `finalR` from the actual exit
 *   price the user provided when they marked the outcome manually, so this
 *   keeps the percentage shown in the UI consistent with the realised
 *   `+1.50R` badge.
 */

/**
 * PnL representation for a journal entry. `null` fields mean "not
 * applicable" rather than "zero" — callers should render '—' for them.
 */
export interface JournalPnl {
  /** Percentage return relative to entry price. Null when not derivable. */
  percent: number | null;
  /**
   * Whether the percent represents a finalised outcome (TP/SL/EXPIRED) or
   * an unrealised mark-to-live for a PENDING entry. Useful when the UI
   * wants to label the value differently (e.g. "Realised" vs "Unrealised").
   */
  realized: boolean;
}

/**
 * Compute the PnL percentage for a journal entry.
 *
 * Order of preference:
 *   1. WAIT signals or CANCELLED entries → null.
 *   2. EXPIRED → 0% (matches finalR=0 semantics).
 *   3. Closed entry with `finalR` and `stopLoss` available → derive % from R.
 *   4. Closed entry without `finalR` → fall back to canonical TP/SL level.
 *   5. PENDING with live price → unrealised mark vs live.
 *   6. Anything else → null.
 */
export function computeJournalPnlPercent(
  entry: SignalJournalEntry,
  livePrice: number | undefined
): number | null {
  return computeJournalPnl(entry, livePrice).percent;
}

export function computeJournalPnl(
  entry: SignalJournalEntry,
  livePrice: number | undefined
): JournalPnl {
  const NA: JournalPnl = { percent: null, realized: false };

  if (entry.entryPrice == null || entry.entryPrice <= 0) return NA;
  if (entry.action === 'WAIT') return NA;
  if (entry.status === 'CANCELLED') return NA;

  // EXPIRED == no outcome accrued. finalR=0 in the store.
  if (entry.status === 'EXPIRED') {
    return { percent: 0, realized: true };
  }

  const isLong = entry.action === 'LONG';
  const entryPrice = entry.entryPrice;

  // 3) Closed with finalR + SL → derive % from R for consistency with badge.
  if (
    isClosedStatus(entry.status) &&
    entry.finalR != null &&
    Number.isFinite(entry.finalR) &&
    entry.stopLoss != null
  ) {
    const rDist = Math.abs(entryPrice - entry.stopLoss);
    if (rDist > 0) {
      return {
        percent: ((entry.finalR * rDist) / entryPrice) * 100,
        realized: true,
      };
    }
  }

  // 4) Closed fallback: canonical TP/SL level. Used for legacy entries that
  //    were closed before `finalR` started being written.
  const fallbackLevel = canonicalLevelForStatus(entry);
  if (fallbackLevel != null) {
    const delta = isLong ? fallbackLevel - entryPrice : entryPrice - fallbackLevel;
    return { percent: (delta / entryPrice) * 100, realized: true };
  }

  // 5) PENDING with live price → mark-to-live.
  if (entry.status === 'PENDING' && livePrice != null && livePrice > 0) {
    const delta = isLong ? livePrice - entryPrice : entryPrice - livePrice;
    return { percent: (delta / entryPrice) * 100, realized: false };
  }

  return NA;
}

function isClosedStatus(s: SignalJournalEntry['status']): boolean {
  return s === 'TP1' || s === 'TP2' || s === 'TP3' || s === 'SL';
}

function canonicalLevelForStatus(entry: SignalJournalEntry): number | null {
  switch (entry.status) {
    case 'SL':
      return entry.stopLoss;
    case 'TP1':
      return entry.tp1;
    case 'TP2':
      return entry.tp2;
    case 'TP3':
      return entry.tp3;
    default:
      return null;
  }
}
