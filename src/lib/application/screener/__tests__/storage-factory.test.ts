import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ScreenerStore } from '../store';
import { SupabaseScreenerStore } from '../supabase-store';
import { __resetScreenerStorageCache, getScreenerStorage } from '../storage-factory';

vi.mock('@/lib/adapters/supabase/server-client', () => ({
  isSupabaseConfigured: vi.fn(() => false),
  getSupabaseAdmin: vi.fn(() => null),
}));

const originalEnv = { ...process.env };

describe('screener storage factory', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
    process.env = { ...originalEnv };
    __resetScreenerStorageCache();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    process.env = { ...originalEnv };
    __resetScreenerStorageCache();
  });

  it('uses file storage by default outside serverless', () => {
    expect(getScreenerStorage()).toBeInstanceOf(ScreenerStore);
  });

  it('fails fast on serverless without Supabase config', () => {
    vi.stubEnv('VERCEL', '1');

    expect(() => getScreenerStorage()).toThrow(/Database storage is required/);
  });

  it('rejects file storage when database is required', () => {
    vi.stubEnv('SCREENER_STORAGE_BACKEND', 'file');
    vi.stubEnv('SCREENER_REQUIRE_DATABASE', '1');

    expect(() => getScreenerStorage()).toThrow(/forbids file storage/);
  });

  it('uses Supabase when explicitly configured', async () => {
    const supabase = await import('@/lib/adapters/supabase/server-client');
    vi.mocked(supabase.isSupabaseConfigured).mockReturnValue(true);
    vi.stubEnv('SCREENER_STORAGE_BACKEND', 'supabase');

    expect(getScreenerStorage()).toBeInstanceOf(SupabaseScreenerStore);
  });
});
