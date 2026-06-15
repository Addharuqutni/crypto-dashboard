import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Server-only Supabase client.
 *
 * Uses the SERVICE ROLE key, which bypasses Row Level Security. This client
 * MUST only ever be imported from server-side code (API routes, scheduler,
 * worker scripts) — never from client components. The service role key is read
 * from a non-`NEXT_PUBLIC_` env var so it is never bundled into the browser.
 *
 * Returns null when Supabase env vars are not configured, allowing the store
 * factory to fall back to the file-based backend transparently.
 */

let cached: SupabaseClient | null = null;

export function getSupabaseAdmin(): SupabaseClient | null {
  if (cached) return cached;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    process.env.SUPABASE_SECRET_KEY?.trim();

  if (!url || !serviceKey) return null;

  cached = createClient(url, serviceKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  return cached;
}

/** True when Supabase is configured (URL + service key present). */
export function isSupabaseConfigured(): boolean {
  return getSupabaseAdmin() !== null;
}
