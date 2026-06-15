import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type {
  RankedScreenerResult,
  ScreenerAiAuditSummary,
  ScreenerAlertRecord,
  ScreenerAlertSettings,
  ScreenerHealth,
} from './types';
import { DEFAULT_SCREENER_ALERT_SETTINGS } from './config';

/**
 * Screener storage layer.
 *
 * File layout (default `<dataDir>` = `./data/screener`):
 *
 *   <dataDir>/
 *     latest.json     — most recent run snapshot, atomically rewritten
 *     history.jsonl   — append-only run summaries
 *     alerts.jsonl    — append-only local alert event records
 *     settings.json   — alert/rank settings, atomically rewritten
 *
 * Atomic semantics for `latest.json` and `settings.json`: write to a sibling
 * tmp file then rename. This avoids torn writes if the process is killed
 * mid-flush. JSONL files are append-only so a partial last line is harmless
 * — subsequent runs simply append a fresh complete line.
 *
 * Missing files return safe defaults instead of throwing — the UI must always
 * be able to render an empty state, even on a fresh deployment.
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

export interface ScreenerHistoryEntry {
  ts: number;
  status: ScreenerHealth['status'];
  evaluatedSymbols: number;
  failedSymbols: number;
  topSymbol: string | null;
  topAction: string | null;
  topScore: number | null;
}

export class ScreenerStore {
  private readonly dataDir: string;
  private readonly latestFile: string;
  private readonly historyFile: string;
  private readonly alertsFile: string;
  private readonly settingsFile: string;

  constructor(dataDir = path.join(process.cwd(), 'data', 'screener')) {
    this.dataDir = dataDir;
    this.latestFile = path.join(dataDir, 'latest.json');
    this.historyFile = path.join(dataDir, 'history.jsonl');
    this.alertsFile = path.join(dataDir, 'alerts.jsonl');
    this.settingsFile = path.join(dataDir, 'settings.json');
  }

  /** Ensure the data directory exists. Safe to call repeatedly. */
  async init(): Promise<void> {
    await fs.mkdir(this.dataDir, { recursive: true });
  }

  // ─── Latest run ───────────────────────────────────────────────────────

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

  /** Atomically replace latest.json. */
  async writeLatest(run: ScreenerLatestRun): Promise<void> {
    await this.init();
    await atomicWriteJson(this.latestFile, run);
  }

  // ─── History (append-only) ────────────────────────────────────────────

  /** Append a compact run summary to history.jsonl. */
  async appendHistory(entry: ScreenerHistoryEntry): Promise<void> {
    await this.init();
    const line = JSON.stringify(entry) + '\n';
    await fs.appendFile(this.historyFile, line, 'utf8');
  }

  /** Read the most recent N history entries (best-effort, tolerant of bad lines). */
  async readRecentHistory(limit = 100): Promise<ScreenerHistoryEntry[]> {
    try {
      const raw = await fs.readFile(this.historyFile, 'utf8');
      const lines = raw.split('\n').filter(Boolean);
      const entries: ScreenerHistoryEntry[] = [];
      for (const line of lines) {
        try {
          entries.push(JSON.parse(line) as ScreenerHistoryEntry);
        } catch {
          // Tolerate corrupt lines silently — append-only logs may have
          // a partial last line if the process was killed mid-write.
        }
      }
      return entries.slice(-limit);
    } catch (err: unknown) {
      const code = (err as NodeJS.ErrnoException)?.code;
      if (code === 'ENOENT') return [];
      console.warn('[screener.store] Failed to read history:', err);
      return [];
    }
  }

  // ─── Settings ─────────────────────────────────────────────────────────

  /** Read alert/rank settings, returning defaults when missing or corrupt. */
  async readSettings(): Promise<ScreenerAlertSettings> {
    try {
      const raw = await fs.readFile(this.settingsFile, 'utf8');
      const parsed = JSON.parse(raw) as Partial<ScreenerAlertSettings>;
      return { ...DEFAULT_SCREENER_ALERT_SETTINGS, ...parsed };
    } catch (err: unknown) {
      const code = (err as NodeJS.ErrnoException)?.code;
      if (code === 'ENOENT') return { ...DEFAULT_SCREENER_ALERT_SETTINGS };
      console.warn('[screener.store] Failed to read settings:', err);
      return { ...DEFAULT_SCREENER_ALERT_SETTINGS };
    }
  }

  /** Atomically replace settings.json. */
  async writeSettings(settings: ScreenerAlertSettings): Promise<void> {
    await this.init();
    await atomicWriteJson(this.settingsFile, settings);
  }

  // ─── Alerts (append-only) ─────────────────────────────────────────────

  /** Append a single local alert event record to alerts.jsonl. */
  async appendAlert(record: ScreenerAlertRecord): Promise<void> {
    await this.init();
    const line = JSON.stringify(record) + '\n';
    await fs.appendFile(this.alertsFile, line, 'utf8');
  }

  /**
   * Read the most recent N alert records (in chronological order).
   * Tolerant of corrupt/truncated lines.
   */
  async readRecentAlerts(limit = 50): Promise<ScreenerAlertRecord[]> {
    try {
      const raw = await fs.readFile(this.alertsFile, 'utf8');
      const lines = raw.split('\n').filter(Boolean);
      const records: ScreenerAlertRecord[] = [];
      for (const line of lines) {
        try {
          records.push(JSON.parse(line) as ScreenerAlertRecord);
        } catch {
          // tolerate bad line
        }
      }
      return records.slice(-limit);
    } catch (err: unknown) {
      const code = (err as NodeJS.ErrnoException)?.code;
      if (code === 'ENOENT') return [];
      console.warn('[screener.store] Failed to read alerts:', err);
      return [];
    }
  }
}

/** Write JSON atomically via unique sibling tmp file + rename. */
async function atomicWriteJson(target: string, payload: unknown): Promise<void> {
  const tmp = makeAtomicTmpPath(target);
  try {
    await fs.writeFile(tmp, JSON.stringify(payload, null, 2), 'utf8');
    await fs.rename(tmp, target);
  } catch (err) {
    await fs.rm(tmp, { force: true }).catch(() => undefined);
    throw err;
  }
}

export function makeAtomicTmpPath(target: string): string {
  const nonce = `${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2)}`;
  return `${target}.${nonce}.tmp`;
}

/** Default singleton path used by API/UI server-side reads. */
export function defaultScreenerStore(): ScreenerStore {
  return new ScreenerStore();
}
