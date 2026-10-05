import { NextRequest } from 'next/server';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import {
  GET as screenerGET,
  allowScreenerRequest,
  resolveScreenerStorageMode,
} from '@/app/api/screener/route';
import { GET as cronScreenerGET } from '@/app/api/cron/screener/route';
import { GET as actionCallGET, POST as actionCallPOST } from '@/app/api/action-call/route';
import { POST as aiChatPOST } from '@/app/api/ai/chat/route';
import { PythonAgentError } from '@/lib/adapters/python-agent/client';
import { AiClientError } from '@/lib/adapters/ai/ai-client';
import * as pythonClient from '@/lib/adapters/python-agent/client';
import * as aiClient from '@/lib/adapters/ai/ai-client';

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
    vi.stubEnv('TRUST_PROXY', '1');
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
    vi.stubEnv('TRUST_PROXY', '1');
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

describe('action-call error hardening', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.unstubAllEnvs();
    process.env = { ...originalEnv };
    vi.stubEnv('TRUST_PROXY', '1');
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    process.env = { ...originalEnv };
  });

  // Distinct client IPs keep each POST off the shared 5/min POST limiter.
  let ipCounter = 0;
  function nextIp() {
    ipCounter += 1;
    return `203.0.113.${ipCounter}`;
  }

  function get(query = '', ip = nextIp()) {
    return new NextRequest(`http://localhost/api/action-call${query}`, {
      headers: { 'x-forwarded-for': ip },
    });
  }

  function post(body?: BodyInit, secret = 'sekret', ip = nextIp()) {
    return actionCallPOST(
      new NextRequest('http://localhost/api/action-call', {
        method: 'POST',
        headers: { authorization: `Bearer ${secret}`, 'x-forwarded-for': ip },
        body,
      })
    );
  }

  it('does not leak the internal agent URL when the agent is unreachable', async () => {
    vi.stubEnv('CRON_SECRET', 'sekret');
    vi.spyOn(pythonClient, 'analyzeActionCall').mockRejectedValue(
      new PythonAgentError(
        'Python agent unreachable at http://127.0.0.1:8000: connect ECONNREFUSED',
        undefined,
        'unreachable'
      )
    );

    const response = await actionCallGET(
      get('?symbol=BTCUSDT')
    );
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.ok).toBe(false);
    expect(JSON.stringify(body)).not.toMatch(/127\.0\.0\.1|8000|ECONNREFUSED/);
  });

  it('maps an agent timeout to 504 with a readable message', async () => {
    vi.spyOn(pythonClient, 'listActionCalls').mockRejectedValue(
      new PythonAgentError('Python agent timeout after 20000ms', undefined, 'timeout')
    );

    const response = await actionCallGET(get('?limit=5'));
    const body = await response.json();

    expect(response.status).toBe(504);
    expect(body.error).toBe('Upstream service took too long to respond.');
  });

  it('rewrites an internal 401 from the agent to 502 without the upstream detail', async () => {
    vi.spyOn(pythonClient, 'analyzeActionCall').mockRejectedValue(
      new PythonAgentError('Python agent error: invalid internal token', 401)
    );

    const response = await actionCallGET(
      get('?symbol=BTCUSDT')
    );
    const body = await response.json();

    expect(response.status).toBe(502);
    expect(body.error).not.toMatch(/internal token/);
  });

  it('forwards symbols from the POST body to the Python scan', async () => {
    vi.stubEnv('CRON_SECRET', 'sekret');
    const scan = vi
      .spyOn(pythonClient, 'triggerActionCallScan')
      .mockResolvedValue({ ok: true, count: 2, results: [] } as never);

    const response = await post(JSON.stringify({ symbols: ['BTCUSDT', 'ETHUSDT'] }));

    expect(response.status).toBe(200);
    expect(scan).toHaveBeenCalledWith(['BTCUSDT', 'ETHUSDT']);
  });

  it('still scans the full universe when the body is empty', async () => {
    vi.stubEnv('CRON_SECRET', 'sekret');
    const scan = vi
      .spyOn(pythonClient, 'triggerActionCallScan')
      .mockResolvedValue({ ok: true, count: 0, results: [] } as never);

    const response = await post();

    expect(response.status).toBe(200);
    expect(scan).toHaveBeenCalledWith(undefined);
  });

  it('rejects a non-array symbols field with 400', async () => {
    vi.stubEnv('CRON_SECRET', 'sekret');
    const scan = vi.spyOn(pythonClient, 'triggerActionCallScan');

    const response = await post(JSON.stringify({ symbols: 'BTCUSDT' }));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      ok: false,
      error: 'symbols must be an array of strings',
    });
    expect(scan).not.toHaveBeenCalled();
  });

  it('rejects an array of non-strings with 400', async () => {
    vi.stubEnv('CRON_SECRET', 'sekret');
    const scan = vi.spyOn(pythonClient, 'triggerActionCallScan');

    const response = await post(JSON.stringify({ symbols: ['BTCUSDT', 42] }));

    expect(response.status).toBe(400);
    expect(scan).not.toHaveBeenCalled();
  });

  it('keeps the 409 scan-already-running contract on the cron route', async () => {
    vi.stubEnv('CRON_SECRET', 'sekret');
    vi.spyOn(pythonClient, 'triggerActionCallScan').mockRejectedValue(
      new PythonAgentError('Python agent error: scan already running', 409)
    );

    const response = await cronScreenerGET(
      new Request('http://localhost/api/cron/screener', {
        headers: { authorization: 'Bearer sekret' },
      })
    );

    expect(response.status).toBe(409);
    expect((await response.json()).success).toBe(false);
  });

  it('does not leak the internal agent URL from the cron route', async () => {
    vi.stubEnv('CRON_SECRET', 'sekret');
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(pythonClient, 'triggerActionCallScan').mockRejectedValue(
      new PythonAgentError(
        'Python agent unreachable at http://127.0.0.1:8000: connect ECONNREFUSED',
        undefined,
        'unreachable'
      )
    );

    const response = await cronScreenerGET(
      new Request('http://localhost/api/cron/screener', {
        headers: { authorization: 'Bearer sekret' },
      })
    );
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(JSON.stringify(body)).not.toMatch(/127\.0\.0\.1|8000|ECONNREFUSED/);
  });
});

describe('ai/chat error hardening', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.unstubAllEnvs();
    process.env = { ...originalEnv };
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    process.env = { ...originalEnv };
  });

  function chat(body: BodyInit) {
    return aiChatPOST(
      new Request('http://localhost/api/ai/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body,
      })
    );
  }

  const BYOK = {
    config: { baseUrl: 'https://api.example.com', apiKey: 'k', model: 'm' },
  };

  it('returns 400 for malformed JSON instead of 500', async () => {
    const response = await chat('{ not json');

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'Invalid JSON body.' });
  });

  it('returns 400 for a JSON body that is not an object', async () => {
    const response = await chat('"just a string"');

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'Invalid JSON body.' });
  });

  it('maps a provider 429 to a public 429 and forwards Retry-After', async () => {
    vi.spyOn(aiClient, 'sendChatCompletion').mockRejectedValue(
      new AiClientError('quota exceeded for tenant abc', 429, undefined, '12')
    );

    const response = await chat(
      JSON.stringify({ ...BYOK, messages: [{ role: 'user', content: 'hi' }] })
    );
    const body = await response.json();

    expect(response.status).toBe(429);
    expect(response.headers.get('Retry-After')).toBe('12');
    expect(body.error).not.toMatch(/tenant abc/);
  });

  it('maps a provider timeout to 504 instead of 500', async () => {
    const abort = new Error('The operation was aborted');
    abort.name = 'AbortError';
    vi.spyOn(aiClient, 'sendChatCompletion').mockRejectedValue(abort);

    const response = await chat(
      JSON.stringify({ ...BYOK, messages: [{ role: 'user', content: 'hi' }] })
    );

    expect(response.status).toBe(504);
    expect((await response.json()).error).toBe('Upstream service took too long to respond.');
  });

  it('rewrites an internal provider 500 to 502 without the provider detail', async () => {
    vi.spyOn(aiClient, 'sendChatCompletion').mockRejectedValue(
      new AiClientError('internal provider stack trace here', 500)
    );

    const response = await chat(
      JSON.stringify({ ...BYOK, messages: [{ role: 'user', content: 'hi' }] })
    );
    const body = await response.json();

    expect(response.status).toBe(502);
    expect(body.error).not.toMatch(/stack trace/);
  });
});
