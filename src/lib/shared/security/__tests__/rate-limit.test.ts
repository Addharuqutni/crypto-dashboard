import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getClientIp, rateLimit } from '../rate-limit';

describe('rateLimit', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it('allows requests up to the limit, then blocks', () => {
    expect(rateLimit('unit:limit', 60_000, 3)).toBe(true);
    expect(rateLimit('unit:limit', 60_000, 3)).toBe(true);
    expect(rateLimit('unit:limit', 60_000, 3)).toBe(true);
    expect(rateLimit('unit:limit', 60_000, 3)).toBe(false);
  });

  it('tracks separate keys independently', () => {
    expect(rateLimit('unit:a', 60_000, 1)).toBe(true);
    expect(rateLimit('unit:b', 60_000, 1)).toBe(true);
    expect(rateLimit('unit:a', 60_000, 1)).toBe(false);
  });

  it('recovers after the window elapses', () => {
    expect(rateLimit('unit:window', 60_000, 1)).toBe(true);
    expect(rateLimit('unit:window', 60_000, 1)).toBe(false);

    vi.setSystemTime(61_000);

    expect(rateLimit('unit:window', 60_000, 1)).toBe(true);
  });
});

describe('getClientIp', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  function request(headers: Record<string, string>): Request {
    return new Request('http://localhost/api/screener', { headers });
  }

  it('buckets as "local" when TRUST_PROXY is unset, ignoring spoofable headers', () => {
    vi.stubEnv('TRUST_PROXY', '');
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    expect(getClientIp(request({ 'x-forwarded-for': '203.0.113.9' }))).toBe('local');
  });

  it('prefers x-real-ip when TRUST_PROXY=1', () => {
    vi.stubEnv('TRUST_PROXY', '1');

    expect(getClientIp(request({ 'x-real-ip': '198.51.100.4', 'x-forwarded-for': '1.2.3.4' }))).toBe(
      '198.51.100.4'
    );
  });

  it('uses the rightmost x-forwarded-for hop when TRUST_PROXY=1 and no x-real-ip', () => {
    vi.stubEnv('TRUST_PROXY', '1');

    expect(getClientIp(request({ 'x-forwarded-for': '1.2.3.4, 198.51.100.7' }))).toBe('198.51.100.7');
  });

  it('warns once when proxy headers appear while TRUST_PROXY is unset', async () => {
    vi.resetModules();
    vi.stubEnv('TRUST_PROXY', '');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { getClientIp: freshGetClientIp } = await import('../rate-limit');
    const proxied = request({ 'x-forwarded-for': '203.0.113.9' });

    freshGetClientIp(proxied);
    freshGetClientIp(proxied);

    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]?.[0]).toMatch(/TRUST_PROXY/);
  });
});
