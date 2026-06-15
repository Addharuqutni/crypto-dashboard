import * as path from 'node:path';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { makeAtomicTmpPath } from '../store';
import { allowScreenerRequest, resolveScreenerStorageMode } from '@/app/api/screener/route';

describe('screener hardening', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.unstubAllEnvs();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    process.env = { ...originalEnv };
  });

  it('creates unique atomic temp paths next to the target file', () => {
    const target = path.join('/tmp', 'screener', 'latest.json');
    const first = makeAtomicTmpPath(target);
    const second = makeAtomicTmpPath(target);

    expect(first).not.toBe(second);
    expect(first.startsWith(`${target}.`)).toBe(true);
    expect(first.endsWith('.tmp')).toBe(true);
  });

  it('defaults production screener API to file mode', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('SCREENER_STORAGE_MODE', '');

    expect(resolveScreenerStorageMode()).toBe('file');
  });

  it('honors explicit on-demand screener API mode', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('SCREENER_STORAGE_MODE', 'on-demand');

    expect(resolveScreenerStorageMode()).toBe('on-demand');
  });

  it('rate limits repeated screener API requests per client', () => {
    vi.stubEnv('SCREENER_API_RATE_LIMIT_PER_MINUTE', '2');
    const request = new Request('http://localhost/api/screener', {
      headers: { 'x-forwarded-for': '203.0.113.10' },
    });

    expect(allowScreenerRequest(request, 1_000)).toBe(true);
    expect(allowScreenerRequest(request, 2_000)).toBe(true);
    expect(allowScreenerRequest(request, 3_000)).toBe(false);
    expect(allowScreenerRequest(request, 62_000)).toBe(true);
  });
});
