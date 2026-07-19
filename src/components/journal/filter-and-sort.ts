import type { SignalJournalEntry, SignalJournalSource } from '@/types/signal-journal';

export interface FilterArgs {
  search: string;
  statusFilter: 'all' | 'open' | 'closed';
  sourceFilter: 'all' | SignalJournalSource;
  sortKey: 'createdAt' | 'finalR' | 'confidence';
  sortDir: 'asc' | 'desc';
}

/**
 * Pure filter+sort for journal entries. Extracted for unit testing.
 */
export function filterAndSort(entries: SignalJournalEntry[], args: FilterArgs): SignalJournalEntry[] {
  const q = args.search.trim().toLowerCase();
  let out = entries.filter((e) => {
    if (args.statusFilter === 'open' && !(e.status === 'PENDING' || e.status === 'CANCELLED')) {
      return false;
    }
    if (
      args.statusFilter === 'closed' &&
      !(
        e.status === 'TP1' ||
        e.status === 'TP2' ||
        e.status === 'TP3' ||
        e.status === 'SL' ||
        e.status === 'EXPIRED'
      )
    ) {
      return false;
    }
    if (args.sourceFilter !== 'all') {
      const src = e.source ?? 'manual';
      if (src !== args.sourceFilter) return false;
    }
    if (q.length > 0) {
      const hay = `${e.symbol} ${e.setupType ?? ''} ${e.marketRegime ?? ''}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  out = [...out].sort((a, b) => {
    const dir = args.sortDir === 'desc' ? -1 : 1;
    if (args.sortKey === 'createdAt') {
      return (a.createdAt - b.createdAt) * dir;
    }
    if (args.sortKey === 'confidence') {
      return (a.confidenceScore - b.confidenceScore) * dir;
    }
    // finalR — push nulls to the bottom regardless of direction.
    const ar = a.finalR ?? null;
    const br = b.finalR ?? null;
    if (ar == null && br == null) return 0;
    if (ar == null) return 1;
    if (br == null) return -1;
    return (ar - br) * dir;
  });

  return out;
}

export function canonicalLevel(
  entry: SignalJournalEntry,
  status: 'TP1' | 'TP2' | 'TP3' | 'SL' | 'EXPIRED'
): number | null {
  if (status === 'TP1') return entry.tp1 ?? null;
  if (status === 'TP2') return entry.tp2 ?? null;
  if (status === 'TP3') return entry.tp3 ?? null;
  if (status === 'SL') return entry.stopLoss;
  return null;
}

export function formatDuration(ms: number): string {
  const totalMin = Math.floor(ms / 60_000);
  if (totalMin < 60) return `${totalMin}m`;
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h < 24) return `${h}h ${m}m`;
  const d = Math.floor(h / 24);
  const rh = h % 24;
  return `${d}d ${rh}h`;
}

export function formatR(v: number): string {
  if (!Number.isFinite(v)) return '∞';
  return v >= 0 ? `+${v.toFixed(2)}` : v.toFixed(2);
}
