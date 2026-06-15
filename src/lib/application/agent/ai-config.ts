import type { AiConfig } from '@/types/ai';

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
