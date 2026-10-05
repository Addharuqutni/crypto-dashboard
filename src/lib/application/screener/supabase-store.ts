import { getSupabaseAdmin } from '@/lib/adapters/supabase/server-client';
import type { ScreenerLatestRun } from './store';
import type { ScreenerStorage } from './storage';

/**
 * Supabase-backed screener snapshot reader.
 *
 * Exists so the snapshot survives on read-only serverless platforms, where the
 * deployment filesystem cannot hold the file the Python engine writes. Reads
 * `screener_kv` key `latest` (see supabase/migrations/0001_screener_storage.sql).
 *
 * Missing rows or a missing client return null rather than throwing — the same
 * contract as the file reader, so the UI renders an empty state either way.
 *
 * This class used to implement nine more methods (history, settings, alerts,
 * action calls). None had a production caller and none is missed: the Python
 * engine owns those datasets in its own files, and the UI reads alerts from the
 * snapshot's own `alertDecisions`.
 */

const KV_LATEST = 'latest';

export class SupabaseScreenerStore implements ScreenerStorage {
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
}
