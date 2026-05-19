import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { ScreenerAlertRecord } from './types';
import type { ScreenerHistoryEntry } from './store';

export interface RetentionConfig {
  /** Max age for history entries in days. Default 90. */
  historyRetentionDays: number;
  /** Max age for alert records in days. Default 30. */
  alertRetentionDays: number;
}

export const DEFAULT_RETENTION_CONFIG: RetentionConfig = {
  historyRetentionDays: 90,
  alertRetentionDays: 30,
};

/**
 * Persistence maintenance for screener file storage.
 *
 * Removes history and alert records older than configured retention.
 * Tolerates corrupt JSONL lines (skips them). Never touches latest.json
 * or settings.json — those are always the most recent snapshot.
 *
 * Call periodically (e.g. daily) or via CLI: `npm run screener -- --cleanup`.
 */
export async function cleanupScreenerStorage(
  dataDir: string,
  config: RetentionConfig = DEFAULT_RETENTION_CONFIG
): Promise<CleanupReport> {
  const now = Date.now();
  const historyFile = path.join(dataDir, 'history.jsonl');
  const alertsFile = path.join(dataDir, 'alerts.jsonl');

  const historyResult = await cleanupJsonl<ScreenerHistoryEntry>(
    historyFile,
    (entry) => now - entry.ts < config.historyRetentionDays * 86_400_000,
    'ts'
  );

  const alertResult = await cleanupJsonl<ScreenerAlertRecord>(
    alertsFile,
    (entry) => now - entry.createdAt < config.alertRetentionDays * 86_400_000,
    'createdAt'
  );

  return {
    historyBefore: historyResult.before,
    historyAfter: historyResult.after,
    historyRemoved: historyResult.removed,
    historyCorrupt: historyResult.corrupt,
    alertsBefore: alertResult.before,
    alertsAfter: alertResult.after,
    alertsRemoved: alertResult.removed,
    alertsCorrupt: alertResult.corrupt,
  };
}

export interface CleanupReport {
  historyBefore: number;
  historyAfter: number;
  historyRemoved: number;
  historyCorrupt: number;
  alertsBefore: number;
  alertsAfter: number;
  alertsRemoved: number;
  alertsCorrupt: number;
}

/**
 * Read a JSONL file, filter entries by retention predicate, rewrite the file
 * with only retained entries. Corrupt lines are silently dropped.
 */
async function cleanupJsonl<T>(
  filePath: string,
  keep: (entry: T) => boolean,
  _tsField: string
): Promise<{ before: number; after: number; removed: number; corrupt: number }> {
  let raw: string;
  try {
    raw = await fs.readFile(filePath, 'utf8');
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException)?.code === 'ENOENT') {
      return { before: 0, after: 0, removed: 0, corrupt: 0 };
    }
    throw err;
  }

  const lines = raw.split('\n').filter(Boolean);
  const retained: string[] = [];
  let corrupt = 0;

  for (const line of lines) {
    try {
      const entry = JSON.parse(line) as T;
      if (keep(entry)) {
        retained.push(line);
      }
    } catch {
      corrupt++;
      // Drop corrupt lines silently.
    }
  }

  // Atomic rewrite via tmp file + rename.
  const tmp = `${filePath}.cleanup.tmp`;
  const content = retained.length > 0 ? retained.join('\n') + '\n' : '';
  await fs.writeFile(tmp, content, 'utf8');
  await fs.rename(tmp, filePath);

  return {
    before: lines.length,
    after: retained.length,
    removed: lines.length - retained.length - corrupt,
    corrupt,
  };
}

/**
 * Export screener history or alerts as JSON array.
 * Tolerates corrupt lines.
 */
export async function exportJsonl<T>(filePath: string): Promise<T[]> {
  let raw: string;
  try {
    raw = await fs.readFile(filePath, 'utf8');
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException)?.code === 'ENOENT') return [];
    throw err;
  }
  const entries: T[] = [];
  for (const line of raw.split('\n').filter(Boolean)) {
    try {
      entries.push(JSON.parse(line) as T);
    } catch {
      // skip corrupt
    }
  }
  return entries;
}

/**
 * Export screener data as CSV string.
 * `fields` specifies column names; missing fields become empty.
 */
export function toCsv<T extends Record<string, unknown>>(entries: T[], fields: string[]): string {
  const header = fields.join(',');
  const rows = entries.map((entry) =>
    fields.map((f) => {
      const val = entry[f];
      if (val == null) return '';
      const str = String(val);
      return str.includes(',') || str.includes('"') || str.includes('\n')
        ? `"${str.replace(/"/g, '""')}"`
        : str;
    }).join(',')
  );
  return [header, ...rows].join('\n');
}
