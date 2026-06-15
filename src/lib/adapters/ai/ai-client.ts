/**
 * AI Client — handles communication with approved OpenAI-compatible LLM APIs.
 * Supports streaming and non-streaming responses while preventing browser-side
 * API keys from being sent to arbitrary remote hosts.
 */

import type { AiConfig, AiChatCompletionRequest, AiChatCompletionResponse, AiStreamChunk, AiMessageRole } from '@/types/ai';

const OPENAI_COMPATIBLE_PATH = '/chat/completions';
const LOCAL_AI_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);

export class AiClientError extends Error {
  constructor(
    message: string,
    public status?: number,
    public code?: string
  ) {
    super(message);
    this.name = 'AiClientError';
  }
}

/**
 * Sends a chat completion request (non-streaming).
 * Returns the full response content.
 */
export async function sendChatCompletion(
  config: AiConfig,
  messages: { role: AiMessageRole; content: string }[],
  options?: { temperature?: number; maxTokens?: number }
): Promise<string> {
  const url = buildSafeProviderUrl(config.baseUrl, OPENAI_COMPATIBLE_PATH);

  const body: AiChatCompletionRequest = {
    model: validateRequiredText(config.model, 'Model'),
    messages,
    stream: false,
    temperature: options?.temperature ?? 0.7,
    max_tokens: options?.maxTokens ?? 2048,
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: buildHeaders(config.apiKey),
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(60_000),
  });

  if (!response.ok) {
    throw await parseError(response);
  }

  const data: AiChatCompletionResponse = await response.json();
  return data.choices[0]?.message?.content ?? '';
}

/**
 * Sends a streaming chat completion request.
 * Calls onChunk for each content delta received.
 * Returns an AbortController to cancel the stream.
 */
export function sendStreamingChatCompletion(
  config: AiConfig,
  messages: { role: AiMessageRole; content: string }[],
  callbacks: {
    onChunk: (content: string) => void;
    onDone: () => void;
    onError: (error: AiClientError) => void;
  },
  options?: { temperature?: number; maxTokens?: number }
): AbortController {
  const controller = new AbortController();

  let url: string;
  let model: string;
  try {
    url = buildSafeProviderUrl(config.baseUrl, OPENAI_COMPATIBLE_PATH);
    model = validateRequiredText(config.model, 'Model');
    validateRequiredText(config.apiKey, 'API key');
  } catch (error) {
    queueMicrotask(() => {
      callbacks.onError(error instanceof AiClientError ? error : new AiClientError('Invalid AI configuration'));
    });
    return controller;
  }

  const body: AiChatCompletionRequest = {
    model,
    messages,
    stream: true,
    temperature: options?.temperature ?? 0.7,
    max_tokens: options?.maxTokens ?? 2048,
  };

  (async () => {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: buildHeaders(config.apiKey),
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw await parseError(response);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new AiClientError('No response body available for streaming');
      }

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed === 'data: [DONE]') continue;
          if (!trimmed.startsWith('data: ')) continue;

          try {
            const json: AiStreamChunk = JSON.parse(trimmed.slice(6));
            const content = json.choices[0]?.delta?.content;
            if (content) callbacks.onChunk(content);
          } catch {
            // Providers may emit keep-alive or malformed SSE lines; ignore them.
          }
        }
      }

      callbacks.onDone();
    } catch (error) {
      if (controller.signal.aborted) return;

      if (error instanceof AiClientError) {
        callbacks.onError(error);
      } else if (error instanceof Error) {
        callbacks.onError(new AiClientError(error.message));
      } else {
        callbacks.onError(new AiClientError('Unknown error occurred'));
      }
    }
  })();

  return controller;
}

/**
 * Tests the connection to the configured AI provider.
 * Sends a minimal request to verify credentials and endpoint.
 */
export async function testConnection(config: AiConfig): Promise<{ success: boolean; message: string }> {
  try {
    const content = await sendChatCompletion(config, [
      { role: 'user', content: 'Reply with "ok" only.' },
    ], { maxTokens: 10 });

    return { success: true, message: `Connected. Response: "${content.slice(0, 50)}"` };
  } catch (error) {
    if (error instanceof AiClientError) {
      return { success: false, message: error.message };
    }
    return { success: false, message: 'Connection failed' };
  }
}

/**
 * Builds a provider URL for any OpenAI-compatible endpoint.
 * Local endpoints may use HTTP. Remote endpoints must use HTTPS so browser-held
 * API keys are not sent over plaintext transport.
 */
function buildSafeProviderUrl(baseUrl: string, path: string): string {
  const parsed = parseProviderBaseUrl(baseUrl);
  const isLocal = LOCAL_AI_HOSTS.has(parsed.hostname);

  if (!isLocal && parsed.protocol !== 'https:') {
    throw new AiClientError('Remote AI providers must use HTTPS.');
  }

  const pathname = parsed.pathname.replace(/\/+$/, '');
  parsed.pathname = pathname.endsWith('/v1') ? `${pathname}${path}` : `${pathname}/v1${path}`;
  parsed.search = '';
  parsed.hash = '';
  return parsed.toString();
}

/** Parse and validate the provider base URL before any request is sent. */
function parseProviderBaseUrl(baseUrl: string): URL {
  const value = validateRequiredText(baseUrl, 'Base URL');
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new AiClientError('AI Base URL must be a valid URL.');
  }

  if (parsed.username || parsed.password) {
    throw new AiClientError('AI Base URL must not include credentials.');
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new AiClientError('AI Base URL must use HTTP or HTTPS.');
  }
  return parsed;
}

/** Validate required text inputs so empty config fails before fetch. */
function validateRequiredText(value: string, label: string): string {
  const trimmed = value.trim();
  if (!trimmed) throw new AiClientError(`${label} is required.`);
  return trimmed;
}

/** Build request headers after validating the API key. */
function buildHeaders(apiKey: string): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${validateRequiredText(apiKey, 'API key')}`,
  };
}

/** Parse provider error payloads into safe UI-facing errors. */
async function parseError(response: Response): Promise<AiClientError> {
  let message = `API error: ${response.status} ${response.statusText}`;
  let code: string | undefined;

  try {
    const body = await response.json();
    if (body.error?.message) {
      message = body.error.message;
      code = body.error.code;
    }
  } catch {
    // Use default message.
  }

  if (response.status === 401) {
    message = 'Invalid API key. Please check your configuration.';
  } else if (response.status === 429) {
    message = 'Rate limit exceeded. Please wait and try again.';
  } else if (response.status === 404) {
    message = 'Model or endpoint not found. Please check your Base URL and Model name.';
  }

  return new AiClientError(message, response.status, code);
}
