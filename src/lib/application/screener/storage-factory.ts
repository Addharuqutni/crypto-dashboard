import { ScreenerStore } from './store';
import { SupabaseScreenerStore } from './supabase-store';
import { isSupabaseConfigured } from '@/lib/adapters/supabase/server-client';
import type { ScreenerStorage } from './storage';

/**
 * Resolve the active screener storage backend.
 *
 * Selection order:
 *   1. SCREENER_STORAGE_BACKEND=supabase|file  — explicit override always wins.
 *   2. Supabase auto-detected (URL + service key present)  → SupabaseScreenerStore.
 *   3. Fallback                                            → file ScreenerStore.
 *
 * On serverless (Vercel) the filesystem is read-only, so Supabase is the only
 * viable persistent backend there. Locally / on a VPS the file store still
 * works with zero config.
 */

let cached: ScreenerStorage | null = null;

export function getScreenerStorage(): ScreenerStorage {
  if (cached) return cached;
  cached = resolveBackend();
  return cached;
}

function resolveBackend(): ScreenerStorage {
  const explicit = process.env.SCREENER_STORAGE_BACKEND?.trim().toLowerCase();
  const requireDatabase = process.env.SCREENER_REQUIRE_DATABASE === '1';

  if (explicit === 'supabase') {
    if (!isSupabaseConfigured()) throwMissingDatabaseConfig();
    return new SupabaseScreenerStore();
  }

  if (explicit === 'file') {
    if (requireDatabase) throwDatabaseRequiredButFileSelected();
    return new ScreenerStore();
  }

  if (isSupabaseConfigured()) return new SupabaseScreenerStore();

  if (requireDatabase) throwMissingDatabaseConfig();

  return new ScreenerStore();
}

function throwMissingDatabaseConfig(): never {
  throw new Error(
    '[screener.storage] Database storage is required but Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.'
  );
}

function throwDatabaseRequiredButFileSelected(): never {
  throw new Error(
    '[screener.storage] SCREENER_REQUIRE_DATABASE=1 forbids file storage. Set SCREENER_STORAGE_BACKEND=supabase.'
  );
}

/** Reset the cached backend — test helper only. */
export function __resetScreenerStorageCache(): void {
  cached = null;
}
