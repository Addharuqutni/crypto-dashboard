import { afterEach, describe, expect, it, vi } from 'vitest';
import { AiClientError } from '@/lib/adapters/ai/ai-client';
import { PythonAgentError } from '@/lib/adapters/python-agent/client';
import { toPublicApiError } from '../api-error';

const OPTIONS = { context: 'api/test', fallbackMessage: 'Failed.', fallbackStatus: 502 };

afterEach(() => {
  vi.restoreAllMocks();
});

describe('toPublicApiError', () => {
  it('never leaks the internal base URL of an unreachable agent', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const err = new PythonAgentError(
      'Python agent unreachable at http://127.0.0.1:8000: ECONNREFUSED',
      undefined,
      'unreachable'
    );

    const result = toPublicApiError(err, OPTIONS);

    expect(result.status).toBe(503);
    expect(result.message).not.toMatch(/127\.0\.0\.1|8000|EADDR|unreachable at/);
  });

  it('maps an agent timeout to 504', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const err = new PythonAgentError('Python agent timeout after 20000ms', undefined, 'timeout');

    expect(toPublicApiError(err, OPTIONS).status).toBe(504);
  });

  it('maps AbortError / TimeoutError to 504 regardless of source', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const abort = new Error('The operation was aborted');
    abort.name = 'AbortError';
    const timeout = new Error('timed out');
    timeout.name = 'TimeoutError';

    expect(toPublicApiError(abort, OPTIONS).status).toBe(504);
    expect(toPublicApiError(timeout, OPTIONS).status).toBe(504);
    expect(toPublicApiError(abort, OPTIONS).message).not.toMatch(/aborted/i);
  });

  it('passes through a genuine client-fault 400', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const err = new PythonAgentError('Python agent error: symbols must be a list', 400);

    const result = toPublicApiError(err, OPTIONS);

    expect(result.status).toBe(400);
    expect(result.message).not.toMatch(/Python agent/);
  });

  it('rewrites internal-service 401 / 403 / 5xx to 502', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const options = { ...OPTIONS, fallbackStatus: 500 };

    for (const status of [401, 403, 500, 503]) {
      const result = toPublicApiError(new AiClientError('nope', status), options);
      expect(result.status).toBe(502);
    }
  });

  it('does not forward the raw provider message on 401', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const result = toPublicApiError(new AiClientError('sk-abc123 leaked', 401), OPTIONS);

    expect(result.message).not.toMatch(/sk-abc123/);
  });

  it('maps a provider 429 to a public 429 with Retry-After', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const err = new AiClientError('quota exhausted for org-42', 429, undefined, '17');

    const result = toPublicApiError(err, OPTIONS);

    expect(result.status).toBe(429);
    expect(result.headers?.['Retry-After']).toBe('17');
    expect(result.message).not.toMatch(/quota exhausted|org-42/);
  });

  it('defaults Retry-After to 60 when the provider omits it', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const result = toPublicApiError(new AiClientError('slow down', 429), OPTIONS);

    expect(result.headers?.['Retry-After']).toBe('60');
  });

  it('treats a pre-flight AI validation error (no status) as a client fault', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(toPublicApiError(new AiClientError('API key is required.'), OPTIONS).status).toBe(400);
  });

  it('falls back for unknown errors and still logs them server-side', () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});

    const result = toPublicApiError(new Error('kaboom'), OPTIONS);

    expect(result).toMatchObject({ status: 502, message: 'Failed.' });
    expect(log).toHaveBeenCalledTimes(1);
  });

  it('honours per-route message overrides', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const result = toPublicApiError(new AiClientError('x', 429), {
      ...OPTIONS,
      messages: { 429: 'Provider is busy, try again shortly.' },
    });

    expect(result.message).toBe('Provider is busy, try again shortly.');
  });
});