import type { ScreenerLatestRun } from './store';

/**
 * The one thing callers cross this seam for: read the latest snapshot.
 *
 * This interface used to carry eleven methods. Ten had no production caller,
 * and they described a file layout that does not exist — `history.jsonl`,
 * `action-calls.jsonl`, `alerts.jsonl`, `settings.json`. The Python engine
 * writes the first two datasets as `history.json` / `action-calls.json`, whole
 * JSON arrays, and writes no alerts or settings file at all.
 *
 * So the write path is Python's, and this seam is a read seam. Narrowing it to
 * what is actually crossed keeps the interface honest — and stops the Supabase
 * adapter carrying nine methods nobody calls.
 *
 * `init()` is gone for the same reason: the reader does not need the directory
 * to exist, it returns null on ENOENT.
 */
export interface ScreenerStorage {
  readLatest(): Promise<ScreenerLatestRun | null>;
}
