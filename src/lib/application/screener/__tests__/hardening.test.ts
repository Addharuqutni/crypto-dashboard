import * as path from 'node:path';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { makeAtomicTmpPath } from '../store';
import {
  GET as screenerGET,
  allowScreenerRequest,
  resolveScreenerStorageMode,
} from '@/app/api/screener/route';
import { GET as cronScreenerGET } from '@/app/api/cron/screener/route';

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

  it('uses file mode as a production preference, not a hard failure mode', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('SCREENER_STORAGE_MODE', 'file');

    expect(resolveScreenerStorageMode()).toBe('file');
    expect(process.env.SCREENER_FILE_MODE_STRICT).toBeUndefined();
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

  it('returns 429 from the screener API after the per-client limit', async () => {
    vi.stubEnv('SCREENER_API_RATE_LIMIT_PER_MINUTE', '1');
    vi.stubEnv('SCREENER_STORAGE_MODE', 'file');
    vi.stubEnv('SCREENER_FILE_MODE_STRICT', '1');
    const request = () =>
      new Request('http://localhost/api/screener', {
        headers: { 'x-forwarded-for': '198.51.100.7' },
      });

    await screenerGET(request());
    const response = await screenerGET(request());
    const body = await response.json();

    expect(response.status).toBe(429);
    expect(response.headers.get('Retry-After')).toBe('60');
    expect(body).toEqual({ ok: false, error: 'Too many screener requests' });
  });

  it('rejects cron screener calls when CRON_SECRET is missing', async () => {
    vi.stubEnv('CRON_SECRET', '');

    const response = await cronScreenerGET(new Request('http://localhost/api/cron/screener'));
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toEqual({ error: 'Cron secret is not configured' });
  });

  it('rejects cron screener calls with the wrong bearer token', async () => {
    vi.stubEnv('CRON_SECRET', 'expected');

    const response = await cronScreenerGET(
      new Request('http://localhost/api/cron/screener', {
        headers: { authorization: 'Bearer wrong' },
      })
    );
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body).toEqual({ error: 'Unauthorized' });
  });
});
