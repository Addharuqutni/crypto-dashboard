import * as fsSync from 'node:fs';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type {
  AlertDedupeRecord,
  AlertDedupeState,
  WorkerHealth,
  WorkerSignalLogEntry,
} from './types';

/**
 * Worker storage layer.
 *
 * The MVP store is a per-process JSONL log + a small JSON state file. The
 * file layout looks like:
 *
 *   <dataDir>/
 *     signals.jsonl   ← one signal per line; append-only
 *     state.json      ← health + dedupe state, atomically rewritten
 *
 * Atomic semantics for state: write to a sibling tmp file then rename. This
 * avoids torn writes if the process is killed mid-flush (common in cron
 * setups). The JSONL log is append-only so a partial last line is harmless —
 * subsequent runs simply append a fresh complete line.
 *
 * No third-party dependencies: keeping the worker installable on bare hosts.
 */

interface StateFile {
  health: WorkerHealth;
  dedupe: AlertDedupeState;
}

export class WorkerStore {
  private readonly dataDir: string;
  private readonly stateFile: string;
  private readonly logFile: string;

  constructor(dataDir: string) {
    this.dataDir = dataDir;
    this.stateFile = path.join(dataDir, 'state.json');
    this.logFile = path.join(dataDir, 'signals.jsonl');
  }

  /** Ensure the data directory exists. Safe to call repeatedly. */
  async init(): Promise<void> {
    await fs.mkdir(this.dataDir, { recursive: true });
  }

  /**
   * Read the persisted state, or return a fresh default snapshot if the file
   * doesn't exist or is corrupt. Corruption is logged but not thrown — the
   * worker should keep running with a clean state rather than refuse to
   * start because of a malformed JSON line.
   */
  async readState(): Promise<StateFile> {
    try {
      const raw = await fs.readFile(this.stateFile, 'utf8');
      const parsed = JSON.parse(raw) as Partial<StateFile>;
      return {
        health: { ...defaultHealth(), ...(parsed.health ?? {}) },
        dedupe: parsed.dedupe ?? {},
      };
    } catch (err: unknown) {
      const code = (err as NodeJS.ErrnoException)?.code;
      if (code === 'ENOENT') {
        return { health: defaultHealth(), dedupe: {} };
      }
      console.warn(`[worker.store] Failed to read state, starting fresh:`, err);
      return { health: defaultHealth(), dedupe: {} };
    }
  }

  /**
   * Atomically replace state.json. Uses write-then-rename so concurrent
   * readers (e.g. a future status endpoint) never observe a half-written file.
   */
  async writeState(state: StateFile): Promise<void> {
    const tmp = `${this.stateFile}.tmp`;
    const payload = JSON.stringify(state, null, 2);
    await fs.writeFile(tmp, payload, 'utf8');
    await fs.rename(tmp, this.stateFile);
  }

  /** Append a single signal log entry as one JSONL row. */
  async appendSignal(entry: WorkerSignalLogEntry): Promise<void> {
    const line = JSON.stringify(entry) + '\n';
    // `appendFile` is atomic for single writes on local filesystems and is
    // exactly what we want for an append-only log.
    await fs.appendFile(this.logFile, line, 'utf8');
  }

  /**
   * Synchronous bootstrap helper for callers that need a known-empty store
   * before the async machinery starts. Used in tests; production paths
   * should prefer `init` + `readState`.
   */
  ensureSync(): void {
    if (!fsSync.existsSync(this.dataDir)) {
      fsSync.mkdirSync(this.dataDir, { recursive: true });
    }
  }
}

export function defaultHealth(): WorkerHealth {
  return {
    lastRunAt: null,
    lastSuccessAt: null,
    lastErrorAt: null,
    consecutiveErrors: 0,
    lastEvaluatedSymbol: null,
    lastSignalAction: null,
    lastDeliveryStatus: null,
    healthAlertsThisHour: {},
    lastError: null,
  };
}

/** Truncate a record's `lastError` to a safe length for JSON storage. */
export function truncateError(err: unknown, max = 500): string {
  const message = err instanceof Error ? err.message : String(err);
  if (message.length <= max) return message;
  return `${message.slice(0, max)}...`;
}

/**
 * Update an existing dedupe record with the latest emit info. Pure helper
 * exposed alongside the store so tests can verify the cooldown bookkeeping
 * without touching disk.
 */
export function recordAlert(
  state: AlertDedupeState,
  record: AlertDedupeRecord
): AlertDedupeState {
  return { ...state, [record.key]: record };
}
