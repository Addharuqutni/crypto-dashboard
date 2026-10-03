import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { constantTimeEqual, requireCronBearer } from '../request-auth';

describe('constantTimeEqual', () => {
  it('returns true for identical strings', () => {
    expect(constantTimeEqual('s3cr3t-token', 's3cr3t-token')).toBe(true);
  });

  it('returns true for two empty strings', () => {
    expect(constantTimeEqual('', '')).toBe(true);
  });

  it('returns false for equal-length but different content', () => {
    expect(constantTimeEqual('aaaa', 'aaab')).toBe(false);
  });

  it('returns false for different lengths', () => {
    expect(constantTimeEqual('short', 'much-longer-value')).toBe(false);
  });
});

describe('requireCronBearer', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.unstubAllEnvs();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    process.env = { ...originalEnv };
  });

  function requestWithAuthorization(authorization?: string): Request {
    return new Request('http://localhost/api/cron/screener', {
      headers: authorization ? { authorization } : {},
    });
  }

  it('returns 500 when CRON_SECRET is not configured', async () => {
    vi.stubEnv('CRON_SECRET', '');

    const response = requireCronBearer(requestWithAuthorization('Bearer anything'));

    expect(response?.status).toBe(500);
    await expect(response?.json()).resolves.toEqual({ error: 'Cron secret is not configured' });
  });

  it('returns 401 when the Authorization header is missing', async () => {
    vi.stubEnv('CRON_SECRET', 'expected');

    const response = requireCronBearer(requestWithAuthorization());

    expect(response?.status).toBe(401);
    await expect(response?.json()).resolves.toEqual({ error: 'Unauthorized' });
  });

  it('returns 401 for a non-Bearer scheme', async () => {
    vi.stubEnv('CRON_SECRET', 'expected');

    const response = requireCronBearer(requestWithAuthorization('Basic expected'));

    expect(response?.status).toBe(401);
  });

  it('returns 401 for a wrong token', async () => {
    vi.stubEnv('CRON_SECRET', 'expected');

    const response = requireCronBearer(requestWithAuthorization('Bearer wrong'));

    expect(response?.status).toBe(401);
    await expect(response?.json()).resolves.toEqual({ error: 'Unauthorized' });
  });

  it('returns null (authorized) for the correct token', () => {
    vi.stubEnv('CRON_SECRET', 'expected');

    expect(requireCronBearer(requestWithAuthorization('Bearer expected'))).toBeNull();
  });
});
