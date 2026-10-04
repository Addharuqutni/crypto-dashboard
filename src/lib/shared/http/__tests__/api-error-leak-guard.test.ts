/**
 * Security invariant: public error payloads must never carry internal
 * detail — no host, port, URL, filesystem path, or stack trace.
 *
 * These assertions are deliberately written against the *serialized* output
 * rather than individual fields, so a future field addition cannot smuggle
 * internal detail past the check.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { toPublicApiError } from '../api-error';

const INTERNAL_DETAIL = /127\.0\.0\.1|localhost|:8000|https?:\/\/|Traceback|\/home\/|ECONNREFUSED/i;

describe('toPublicApiError leak guard', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const cases: { label: string; err: unknown; expectStatus: number }[] = [
    {
      label: 'python agent unreachable',
      err: {
        name: 'PythonAgentError',
        kind: 'unreachable',
        message: 'Python agent unreachable at http://127.0.0.1:8000: ECONNREFUSED',
      },
      expectStatus: 503,
    },
    {
      label: 'python agent timeout',
      err: { name: 'PythonAgentError', kind: 'timeout', message: 'timeout after 20000ms' },
      expectStatus: 504,
    },
    {
      label: 'internal 401',
      err: {
        name: 'PythonAgentError',
        status: 401,
        message: 'Unauthorized: token rejected by http://127.0.0.1:8000',
      },
      expectStatus: 502,
    },
    {
      label: 'internal 500 with traceback',
      err: {
        name: 'PythonAgentError',
        status: 500,
        message: 'Traceback at /home/user/agent/src/web.py line 42',
      },
      expectStatus: 502,
    },
    {
      label: 'abort error',
      err: { name: 'AbortError', message: 'The operation was aborted' },
      expectStatus: 504,
    },
    {
      label: 'plain Error with url',
      err: new Error('failed calling http://127.0.0.1:8000/api/v1/scan'),
      expectStatus: 502,
    },
  ];

  for (const { label, err, expectStatus } of cases) {
    it(`does not leak internal detail for ${label}`, () => {
      const out = toPublicApiError(err, {
        context: 'test',
        fallbackMessage: 'Something went wrong.',
      });

      expect(out.status).toBe(expectStatus);
      expect(JSON.stringify(out)).not.toMatch(INTERNAL_DETAIL);
      // The message must be the generic copy, not the original.
      expect(out.message).not.toBe((err as { message?: string })?.message);
    });
  }

  it('still logs the original server-side so debugging is possible', () => {
    const err = { name: 'PythonAgentError', status: 500, message: 'internal detail here' };
    toPublicApiError(err, { context: 'action-call', fallbackMessage: 'fallback' });

    expect(console.error).toHaveBeenCalled();
    const logged = JSON.stringify(vi.mocked(console.error).mock.calls);
    expect(logged).toContain('internal detail here');
    expect(logged).toContain('action-call');
  });
});
