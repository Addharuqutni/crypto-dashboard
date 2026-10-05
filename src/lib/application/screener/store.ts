import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { RankedScreenerResult, ScreenerAiAuditSummary, ScreenerHealth } from './types';

/**
 * Screener snapshot reader.
 *
 * The on-disk layout is owned by the Python engine (`agent/src/screener/storage.py`),
 * which is the only writer. `latest.json` is the one file both sides agree on,
 * and the one this module reads. Everything else the engine persists
 * (`history.json`, `action-calls.json`) is consumed inside Python.
 *
 * This module used to also declare `history.jsonl`, `action-calls.jsonl`,
 * `alerts.jsonl` and `settings.json` and offer readers and writers for them.
 * Not one of those four files has ever existed. The Python engine persists the
 * same two datasets under different names — `history.json` and
 * `action-calls.json`, whole JSON arrays rather than JSONL — so the readers
 * here asked for filenames nobody writes and returned a silent empty list on
 * ENOENT, while the writers appended lines to files nobody reads. Nothing
 * errors; the feature simply is not there.
 *
 * The damage was in the naming, not the code path: a reader of this file would
 * reasonably conclude the screener's history lives in `history.jsonl`, and be
 * wrong. Alerts, meanwhile, reach the UI from the engine's own `alertDecisions`
 * (see `to-alerts.ts`), so no alerts file is involved at all.
 *
 * Missing or corrupt `latest.json` returns null instead of throwing: the UI
 * must render an empty state on a fresh deployment.
 */

export interface ScreenerLatestRun {
  /** Unix ms when the run completed. */
  completedAt: number;
  /** Health snapshot from the runner. */
  health: ScreenerHealth;
  /** Ranked results from the run. */
  results: RankedScreenerResult[];
  /** Echo of the timeframes used for the run, for UI display. */
  timeframes: {
    setup: string;
    trigger: string;
    macro: string;
  };
  /** Echo of the universe size for the UI. */
  universeSize: number;
  /**
   * Optional AI audit summaries keyed by symbol. Absent or empty when AI
   * is not configured. AI audits never override the deterministic decision.
   */
  audits?: Record<string, ScreenerAiAuditSummary>;
}

/** Filename of the snapshot, as written by the Python engine. */
export const LATEST_SNAPSHOT_FILE = 'latest.json';

export class ScreenerStore {
  private readonly latestFile: string;

  constructor(dataDir = path.join(process.cwd(), 'data', 'screener')) {
    this.latestFile = path.join(dataDir, LATEST_SNAPSHOT_FILE);
  }

  /** Read the most recent run, or null when no run has been persisted. */
  async readLatest(): Promise<ScreenerLatestRun | null> {
    try {
      const raw = await fs.readFile(this.latestFile, 'utf8');
      return JSON.parse(raw) as ScreenerLatestRun;
    } catch (err: unknown) {
      const code = (err as NodeJS.ErrnoException)?.code;
      if (code === 'ENOENT') return null;
      console.warn('[screener.store] Failed to read latest:', err);
      return null;
    }
  }
}
