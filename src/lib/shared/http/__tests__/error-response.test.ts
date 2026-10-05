import { describe, expect, it, vi, afterEach } from 'vitest';

import {
  apiErrorResponse,
  bareErrorEnvelope,
  successKeyErrorEnvelope,
} from '@/lib/shared/http/error-response';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('apiErrorResponse', () => {
  it('always sets no-store, including when the classifier adds no headers', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const response = apiErrorResponse(new Error('boom'), {
      context: 'test',
      fallbackMessage: 'Failed',
      fallbackStatus: 500,
    });

    expect(response.headers.get('Cache-Control')).toBe('no-store');
  });

  it('keeps classifier headers alongside no-store', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const providerError = Object.assign(new Error('slow down'), {
      name: 'AiClientError',
      status: 429,
      retryAfter: '12',
    });

    const response = apiErrorResponse(providerError, {
      context: 'test',
      fallbackMessage: 'Failed',
    });

    expect(response.status).toBe(429);
    expect(response.headers.get('Retry-After')).toBe('12');
    expect(response.headers.get('Cache-Control')).toBe('no-store');
  });

  it('defaults the failure key to `ok`', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const response = apiErrorResponse(new Error('boom'), {
      context: 'test',
      fallbackMessage: 'Failed',
      fallbackStatus: 500,
    });

    expect(await response.json()).toEqual({ ok: false, error: 'Failed' });
  });

  it('honours the `success` key for the cron route contract', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const response = apiErrorResponse(new Error('boom'), {
      context: 'test',
      fallbackMessage: 'Failed',
      fallbackStatus: 500,
      envelope: successKeyErrorEnvelope,
    });

    expect(await response.json()).toEqual({ success: false, error: 'Failed' });
  });

  it('honours the bare `error` key for the AI routes', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const response = apiErrorResponse(new Error('boom'), {
      context: 'test',
      fallbackMessage: 'Failed',
      fallbackStatus: 500,
      envelope: bareErrorEnvelope,
    });

    expect(await response.json()).toEqual({ error: 'Failed' });
  });

  it('never leaks the original message to the client', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const response = apiErrorResponse(
      new Error('upstream at http://127.0.0.1:8000 refused'),
      { context: 'test', fallbackMessage: 'Upstream failed', fallbackStatus: 502 }
    );

    expect(JSON.stringify(await response.json())).not.toMatch(/127\.0\.0\.1|8000/);
  });
});
