import type {
  ScreenerAlertRecord,
  ScreenerActionCallRecord,
  ScreenerAlertSettings,
} from './types';
import type { ScreenerLatestRun, ScreenerHistoryEntry } from './store';

/**
 * Storage contract shared by every screener backend (file, Supabase, …).
 *
 * Both `ScreenerStore` (file) and `SupabaseScreenerStore` implement this so
 * callers depend on the interface, not a concrete backend. `init()` is a
 * no-op for backends that need no bootstrap (Supabase tables are created via
 * migration), kept for file-store compatibility.
 */
export interface ScreenerStorage {
  init(): Promise<void>;

  readLatest(): Promise<ScreenerLatestRun | null>;
  writeLatest(run: ScreenerLatestRun): Promise<void>;

  appendHistory(entry: ScreenerHistoryEntry): Promise<void>;
  readRecentHistory(limit?: number): Promise<ScreenerHistoryEntry[]>;

  readSettings(): Promise<ScreenerAlertSettings>;
  writeSettings(settings: ScreenerAlertSettings): Promise<void>;

  appendAlert(record: ScreenerAlertRecord): Promise<void>;
  readRecentAlerts(limit?: number): Promise<ScreenerAlertRecord[]>;

  appendActionCalls(records: ScreenerActionCallRecord[]): Promise<void>;
  readRecentActionCalls(limit?: number): Promise<ScreenerActionCallRecord[]>;
}
