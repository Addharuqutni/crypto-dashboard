import { afterEach, describe, expect, it, vi } from 'vitest';
import { AiClientError, sendChatCompletion, testConnection } from '../ai-client';

const ORIGINAL_FETCH = globalThis.fetch;

type FetchMock = ReturnType<typeof vi.fn>;

function jsonResponse(body: unknown, status = 200, statusText = 'OK'): Response {
  return new Response(JSON.stringify(body), {
    status,
    statusText,
    headers: { 'content-type': 'application/json' },
  });
}

afterEach(() => {
  globalThis.fetch = ORIGINAL_FETCH;
  vi.restoreAllMocks();
});

describe('ai-client', () => {
  it('rejects remote HTTP providers before sending credentials', async () => {
    const fetchMock: FetchMock = vi.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await expect(
      sendChatCompletion(
        { baseUrl: 'http://api.example.com', apiKey: 'secret', model: 'gpt-test' },
        [{ role: 'user', content: 'hello' }]
      )
    ).rejects.toThrow('Remote AI providers must use HTTPS.');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('allows localhost HTTP and normalizes OpenAI-compatible URL', async () => {
    const fetchMock: FetchMock = vi
      .fn()
      .mockResolvedValue(
        jsonResponse({
          choices: [
            { message: { role: 'assistant', content: 'ok' }, finish_reason: 'stop', index: 0 },
          ],
        })
      );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await expect(
      sendChatCompletion(
        {
          baseUrl: 'http://localhost:11434/v1?ignored=1#hash',
          apiKey: 'local-key',
          model: 'local-model',
        },
        [{ role: 'user', content: 'ping' }],
        { maxTokens: 3 }
      )
    ).resolves.toBe('ok');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]![0]).toBe('http://localhost:11434/v1/chat/completions');
    expect(fetchMock.mock.calls[0]![1]).toMatchObject({
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer local-key',
      },
    });
  });

  it('maps provider auth failures to safe UI-facing errors', async () => {
    const fetchMock: FetchMock = vi
      .fn()
      .mockResolvedValue(
        jsonResponse(
          { error: { message: 'raw provider detail', code: 'bad_key' } },
          401,
          'Unauthorized'
        )
      );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await expect(
      sendChatCompletion({ baseUrl: 'https://api.example.com', apiKey: 'bad', model: 'gpt-test' }, [
        { role: 'user', content: 'hello' },
      ])
    ).rejects.toMatchObject({
      name: 'AiClientError',
      status: 401,
      code: 'bad_key',
      message: 'Invalid API key. Please check your configuration.',
    } satisfies Partial<AiClientError>);
  });

  it('turns validation errors into failed connection checks', async () => {
    await expect(testConnection({ baseUrl: '', apiKey: 'x', model: 'm' })).resolves.toEqual({
      success: false,
      message: 'Base URL is required.',
    });
  });
});
