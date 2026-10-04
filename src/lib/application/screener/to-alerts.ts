import type {
  ScreenerAlertRecord,
  ScreenerAlertStatus,
} from '@/lib/application/screener/types';
import type { FuturesGrade, FuturesSignalAction } from '@/types/signal-core';

/**
 * Map the Python screener's `alertDecisions` into the `ScreenerAlertRecord`
 * shape the Alert History panel renders.
 *
 * The Python engine owns alert policy, so these rows are decisions it already
 * made, not something the dashboard recomputes. Everything here is defensive:
 * the snapshot is read from disk and may come from an older engine version
 * that emitted fewer fields, or from a partially written file.
 *
 * Rows that cannot be rendered meaningfully are dropped rather than shown with
 * placeholder values, because a wrong confidence or grade is worse than an
 * absent row in an alert list.
 */

const KNOWN_STATUSES: ReadonlySet<string> = new Set<ScreenerAlertStatus>([
  'triggered',
  'skipped',
  'suppressed_cooldown',
  'suppressed_hourly_cap',
  'suppressed_low_quality',
  'expired',
]);

const KNOWN_GRADES: ReadonlySet<string> = new Set(['A+', 'A', 'B', 'C', 'D']);

const KNOWN_ACTIONS: ReadonlySet<string> = new Set(['LONG', 'SHORT', 'WAIT']);

function asFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function asString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

/** Drop the ccxt `:SETTLE` suffix so the panel shows `BTC/USDT`, not `BTC/USDT:USDT`. */
export function displaySymbol(symbol: string): string {
  const [pair] = symbol.split(':');
  return pair || symbol;
}

export function toAlertRecord(raw: unknown): ScreenerAlertRecord | null {
  if (!raw || typeof raw !== 'object') return null;
  const row = raw as Record<string, unknown>;

  const symbol = asString(row.symbol);
  const status = asString(row.status);
  const action = asString(row.action);
  if (!symbol || !status || !action) return null;
  if (!KNOWN_STATUSES.has(status) || !KNOWN_ACTIONS.has(action)) return null;

  const confidence = asFiniteNumber(row.confidence);
  const createdAt = asFiniteNumber(row.createdAt);
  if (confidence == null || createdAt == null) return null;

  const grade = asString(row.grade);

  return {
    symbol: displaySymbol(symbol),
    action: action as FuturesSignalAction,
    rankingScore: asFiniteNumber(row.rankingScore) ?? 0,
    confidence,
    grade: (grade && KNOWN_GRADES.has(grade) ? grade : 'D') as FuturesGrade,
    entry: asFiniteNumber(row.entry),
    stopLoss: asFiniteNumber(row.stopLoss),
    status: status as ScreenerAlertStatus,
    reason: asString(row.reason) ?? '',
    createdAt,
  };
}

/**
 * Map a whole `alertDecisions` array, preserving engine order.
 *
 * The engine emits decisions in ranked-result order, and the panel reverses
 * what it receives, so the newest cycle's top-ranked setup ends up first.
 */
export function toAlertRecords(value: unknown): ScreenerAlertRecord[] {
  if (!Array.isArray(value)) return [];
  const records: ScreenerAlertRecord[] = [];
  for (const row of value) {
    const record = toAlertRecord(row);
    if (record) records.push(record);
  }
  return records;
}
