import { ScreenerStore } from './store';
import { SupabaseScreenerStore } from './supabase-store';
import { isSupabaseConfigured } from '@/lib/adapters/supabase/server-client';
import type { ScreenerStorage } from './storage';

/**
 * Resolve the active screener storage backend.
 *
 * Selection order:
 *   1. SCREENER_STORAGE_BACKEND=supabase|file  — explicit override wins.
 *   2. Supabase auto-detected (URL + service key present)  → SupabaseScreenerStore.
 *   3. Long-running local/VPS fallback                     → file ScreenerStore.
 *
 * On Vercel/serverless, file storage is forbidden unless explicitly requested
 * for local emulation. Serverless functions cannot persist writes to the
 * deployment filesystem, so missing Supabase config fails fast instead of
 * silently returning stale/empty data.
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
  const serverless = isServerlessRuntime();

  if (explicit === 'supabase') {
    if (!isSupabaseConfigured()) throwMissingDatabaseConfig();
    return new SupabaseScreenerStore();
  }

  if (explicit === 'file') {
    if (requireDatabase) throwDatabaseRequiredButFileSelected();
    if (serverless) throwFileStorageUnavailableOnServerless();
    return new ScreenerStore();
  }

  if (isSupabaseConfigured()) return new SupabaseScreenerStore();

  if (requireDatabase || serverless) throwMissingDatabaseConfig();

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

function throwFileStorageUnavailableOnServerless(): never {
  throw new Error(
    '[screener.storage] File storage is unavailable on Vercel/serverless. Configure Supabase storage for screener.'
  );
}

function isServerlessRuntime(): boolean {
  return (
    process.env.VERCEL === '1' ||
    process.env.VERCEL === 'true' ||
    Boolean(process.env.AWS_LAMBDA_FUNCTION_NAME) ||
    process.env.LAMBDA_TASK_ROOT === '/var/task' ||
    Boolean(process.env.NOW_REGION)
  );
}

/** Reset the cached backend — test helper only. */
export function __resetScreenerStorageCache(): void {
  cached = null;
}
