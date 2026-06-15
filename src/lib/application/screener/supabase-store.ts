import { getSupabaseAdmin } from '@/lib/adapters/supabase/server-client';
import { DEFAULT_SCREENER_ALERT_SETTINGS } from './config';
import type {
  ScreenerAlertRecord,
  ScreenerAlertSettings,
} from './types';
import type { ScreenerLatestRun, ScreenerHistoryEntry } from './store';
import type { ScreenerStorage } from './storage';

/**
 * Supabase-backed screener storage.
 *
 * Persists screener output to Postgres (Supabase) instead of the local
 * filesystem, so it works on read-only serverless platforms (Vercel) and
 * survives cold starts / multiple instances.
 *
 * Schema (see supabase/migrations/0001_screener_storage.sql):
 *   - screener_kv      key/value JSONB singletons ('latest', 'settings')
 *   - screener_history append-only run summaries
 *   - screener_alerts  append-only local alert records
 *
 * Missing rows return safe defaults (null / [] / default settings) so the UI
 * always renders an empty state on a fresh deployment — same contract as the
 * file store. All errors are logged and degrade gracefully rather than throw
 * on the read path; writes surface errors so the caller can log a failed cycle.
 */

const KV_LATEST = 'latest';
const KV_SETTINGS = 'settings';

export class SupabaseScreenerStore implements ScreenerStorage {
  /** No bootstrap needed — tables exist via migration. */
  async init(): Promise<void> {
    /* no-op */
  }

  // ─── Latest run ───────────────────────────────────────────────────────

  async readLatest(): Promise<ScreenerLatestRun | null> {
    const client = getSupabaseAdmin();
    if (!client) return null;

    const { data, error } = await client
      .from('screener_kv')
      .select('value')
      .eq('key', KV_LATEST)
      .maybeSingle();

    if (error) {
      console.warn('[screener.supabase] readLatest failed:', error.message);
      return null;
    }
    return (data?.value as ScreenerLatestRun | undefined) ?? null;
  }

  async writeLatest(run: ScreenerLatestRun): Promise<void> {
    const client = requireClient();
    const { error } = await client
      .from('screener_kv')
      .upsert(
        { key: KV_LATEST, value: run, updated_at: new Date().toISOString() },
        { onConflict: 'key' }
      );
    if (error) throw new Error(`[screener.supabase] writeLatest: ${error.message}`);
  }

  // ─── History (append-only) ────────────────────────────────────────────

  async appendHistory(entry: ScreenerHistoryEntry): Promise<void> {
    const client = requireClient();
    const { error } = await client
      .from('screener_history')
      .insert({ ts: entry.ts, entry });
    if (error) throw new Error(`[screener.supabase] appendHistory: ${error.message}`);
  }

  async readRecentHistory(limit = 100): Promise<ScreenerHistoryEntry[]> {
    const client = getSupabaseAdmin();
    if (!client) return [];

    const { data, error } = await client
      .from('screener_history')
      .select('entry')
      .order('ts', { ascending: false })
      .limit(limit);

    if (error) {
      console.warn('[screener.supabase] readRecentHistory failed:', error.message);
      return [];
    }
    // Reverse to chronological (oldest→newest) to match file store slice(-limit).
    return (data ?? [])
      .map((row) => row.entry as ScreenerHistoryEntry)
      .reverse();
  }

  // ─── Settings ─────────────────────────────────────────────────────────

  async readSettings(): Promise<ScreenerAlertSettings> {
    const client = getSupabaseAdmin();
    if (!client) return { ...DEFAULT_SCREENER_ALERT_SETTINGS };

    const { data, error } = await client
      .from('screener_kv')
      .select('value')
      .eq('key', KV_SETTINGS)
      .maybeSingle();

    if (error) {
      console.warn('[screener.supabase] readSettings failed:', error.message);
      return { ...DEFAULT_SCREENER_ALERT_SETTINGS };
    }
    const parsed = (data?.value as Partial<ScreenerAlertSettings> | undefined) ?? {};
    return { ...DEFAULT_SCREENER_ALERT_SETTINGS, ...parsed };
  }

  async writeSettings(settings: ScreenerAlertSettings): Promise<void> {
    const client = requireClient();
    const { error } = await client
      .from('screener_kv')
      .upsert(
        { key: KV_SETTINGS, value: settings, updated_at: new Date().toISOString() },
        { onConflict: 'key' }
      );
    if (error) throw new Error(`[screener.supabase] writeSettings: ${error.message}`);
  }

  // ─── Alerts (append-only) ─────────────────────────────────────────────

  async appendAlert(record: ScreenerAlertRecord): Promise<void> {
    const client = requireClient();
    const { error } = await client
      .from('screener_alerts')
      .insert({ record });
    if (error) throw new Error(`[screener.supabase] appendAlert: ${error.message}`);
  }

  async readRecentAlerts(limit = 50): Promise<ScreenerAlertRecord[]> {
    const client = getSupabaseAdmin();
    if (!client) return [];

    const { data, error } = await client
      .from('screener_alerts')
      .select('record')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.warn('[screener.supabase] readRecentAlerts failed:', error.message);
      return [];
    }
    // Reverse to chronological order to match file store contract.
    return (data ?? [])
      .map((row) => row.record as ScreenerAlertRecord)
      .reverse();
  }
}

function requireClient() {
  const client = getSupabaseAdmin();
  if (!client) {
    throw new Error(
      '[screener.supabase] Supabase is not configured (missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY)'
    );
  }
  return client;
}
