import { NextResponse } from 'next/server';
import { testConnection } from '@/lib/adapters/ai/ai-client';
import { resolveAiConfig } from '@/lib/application/signal-agent/ai-config';
import { rateLimit, getClientIp, rateLimitedResponse } from '@/lib/shared/security/rate-limit';
import type { AiConfig } from '@/types/ai';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/ai/test
 *
 * Connection test for OpenAI-compatible providers.
 * - Full client config: validates that provider only (BYOK test) after SSRF checks.
 * - Partial client config: rejected — never falls back to server AI_* keys.
 * - Empty client config: uses server AI_* env.
 * Rate-limited; never a free open proxy for arbitrary traffic.
 */
export async function POST(request: Request) {
  try {
    const ip = getClientIp(request);
    if (!rateLimit(`ai-test:${ip}`, 60_000, 10)) {
      return rateLimitedResponse({ success: false, message: 'Too many requests. Please wait a moment.' });
    }

    const body = (await request.json().catch(() => ({}))) as Partial<AiConfig>;
    const config = resolveAiConfig(body);

    if (!config?.baseUrl || !config.apiKey || !config.model) {
      return NextResponse.json(
        { success: false, message: 'Base URL, API key, and model are required.' },
        { status: 400 }
      );
    }

    const result = await testConnection(config);
    return NextResponse.json(result, {
      status: result.success ? 200 : 400,
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        message: error instanceof Error ? error.message : 'Connection failed',
      },
      { status: 500 }
    );
  }
}
