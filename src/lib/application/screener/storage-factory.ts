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

  if (explicit === 'supabase') return new SupabaseScreenerStore();
  if (explicit === 'file') return new ScreenerStore();

  if (isSupabaseConfigured()) return new SupabaseScreenerStore();

  return new ScreenerStore();
}

/** Reset the cached backend — test helper only. */
export function __resetScreenerStorageCache(): void {
  cached = null;
}
