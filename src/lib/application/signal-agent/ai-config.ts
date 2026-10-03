import type { AiConfig } from '@/types/ai';

/**
 * Resolve the effective AI config for a request.
 *
 * - Full client config → use it (BYOK; SSRF-checked downstream in ai-client).
 * - Partial client config → reject (null); never silently fall back to server keys.
 * - Empty client config → server AI_* env.
 */
export function resolveAiConfig(config?: Partial<AiConfig>): AiConfig | null {
  const local = {
    baseUrl: String(config?.baseUrl ?? '').trim(),
    apiKey: String(config?.apiKey ?? '').trim(),
    model: String(config?.model ?? '').trim(),
  };
  const any = Boolean(local.baseUrl || local.apiKey || local.model);
  const all = Boolean(local.baseUrl && local.apiKey && local.model);
  if (all) return local;
  if (any) return null;
  return readAiConfigFromEnv();
}

export function readAiConfigFromEnv(prefix = 'AI'): AiConfig | null {
  const baseUrl = process.env[`${prefix}_BASE_URL`]?.trim();
  const apiKey = process.env[`${prefix}_API_KEY`]?.trim();
  const model = process.env[`${prefix}_MODEL`]?.trim();
  if (!baseUrl || !apiKey || !model) return null;

  try {
    const url = new URL(baseUrl);
    const isLocal = url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '::1';
    if (!isLocal && url.protocol !== 'https:') {
      throw new Error('remote AI base URL must use HTTPS');
    }
  } catch (err) {
    console.warn('[ai-config] invalid AI_BASE_URL, AI disabled:', err instanceof Error ? err.message : err);
    return null;
  }

  return { baseUrl, apiKey, model };
}
