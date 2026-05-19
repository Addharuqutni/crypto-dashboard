import type { SignalJournalEntry } from '@/types/signal-journal';

/**
 * Journal CSV export.
 *
 * Why this lives in its own module:
 *   - It's pure: input → string. Easy to unit test.
 *   - Both the panel and any future bulk-export tooling can share it.
 *   - Keeps the panel component free of escape/quote logic.
 *
 * The output is RFC-4180-ish: comma separator, double-quoted fields,
 * doubled internal quotes. Intl-safe — we use ISO timestamps so locale
 * has no effect on the audit trail.
 */

const HEADERS = [
  'id',
  'createdAt',
  'createdAtIso',
  'symbol',
  'timeframe',
  'action',
  'status',
  'source',
  'grade',
  'confidence',
  'entry',
  'stop',
  'tp1',
  'tp2',
  'tp3',
  'mfe',
  'mae',
  'finalR',
  'regime',
  'tradePermission',
  'setupType',
  'rr',
  'expiresAt',
  'expiresAtIso',
] as const;

export function entriesToCsv(entries: SignalJournalEntry[]): string {
  const rows = [HEADERS.join(',')];
  for (const e of entries) {
    rows.push(
      [
        e.id,
        e.createdAt,
        new Date(e.createdAt).toISOString(),
        e.symbol,
        e.timeframe,
        e.action,
        e.status,
        e.source ?? 'manual',
        e.signalGrade,
        e.confidenceScore,
        nullable(e.entryPrice),
        nullable(e.stopLoss),
        nullable(e.tp1),
        nullable(e.tp2),
        nullable(e.tp3),
        nullable(e.maxFavorableExcursion),
        nullable(e.maxAdverseExcursion),
        nullable(e.finalR),
        e.marketRegime ?? '',
        e.tradePermission ?? '',
        e.setupType ?? '',
        nullable(e.riskRewardRatio),
        nullable(e.expiresAt),
        e.expiresAt ? new Date(e.expiresAt).toISOString() : '',
      ]
        .map(escapeCsv)
        .join(',')
    );
  }
  return rows.join('\n');
}

function nullable(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return '';
  return String(v);
}

function escapeCsv(value: string | number): string {
  const s = String(value ?? '');
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/**
 * Trigger a browser download of the given CSV. No-op when called
 * outside the browser (SSR/test).
 */
export function downloadCsv(filename: string, csv: string): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Defer revoke to next tick so the click can complete in older browsers.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
