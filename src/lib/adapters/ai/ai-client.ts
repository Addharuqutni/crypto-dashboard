/**
 * AI Client — handles communication with OpenAI-compatible LLM APIs.
 * Supports both streaming and non-streaming responses.
 * Works with OpenAI, Groq, Together AI, Ollama, and any compatible provider.
 */

import type { AiConfig, AiChatCompletionRequest, AiChatCompletionResponse, AiStreamChunk, AiMessageRole } from '@/types/ai';

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
  const url = buildUrl(config.baseUrl, '/chat/completions');

  const body: AiChatCompletionRequest = {
    model: config.model,
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

  const url = buildUrl(config.baseUrl, '/chat/completions');

  const body: AiChatCompletionRequest = {
    model: config.model,
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
            if (content) {
              callbacks.onChunk(content);
            }
          } catch {
            // Skip malformed JSON lines
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

// --- Helpers ---

/**

 * Membuat url berdasarkan input saat ini.

 * Dipakai agar proses pembentukan data tetap konsisten di satu tempat.

 */

function buildUrl(baseUrl: string, path: string): string {
  const base = baseUrl.replace(/\/+$/, '');
  return base.includes('/v1') ? `${base}${path}` : `${base}/v1${path}`;
}

/**

 * Membuat headers berdasarkan input saat ini.

 * Dipakai agar proses pembentukan data tetap konsisten di satu tempat.

 */

function buildHeaders(apiKey: string): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${apiKey}`,
  };
}

/**

 * Menjalankan logic parse error.

 * Dipakai untuk memisahkan tanggung jawab fungsi ini dari bagian aplikasi lain.

 */

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
    // Use default message
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
