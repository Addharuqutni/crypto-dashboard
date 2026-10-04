import { NextResponse } from 'next/server';
import { sendChatCompletion } from '@/lib/adapters/ai/ai-client';
import { resolveAiConfig } from '@/lib/application/signal-agent/ai-config';
import { rateLimit, getClientIp, rateLimitedResponse } from '@/lib/shared/security/rate-limit';
import { toPublicApiError } from '@/lib/shared/http/api-error';
import type { AiConfig, AiMessageRole } from '@/types/ai';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Body = {
  config?: Partial<AiConfig>;
  messages?: { role: AiMessageRole; content: string }[];
  temperature?: number;
  maxTokens?: number;
};

export async function POST(request: Request) {
  try {
    const ip = getClientIp(request);
    if (!rateLimit(`ai-chat:${ip}`, 60_000, 20)) {
      return rateLimitedResponse({ error: 'Too many requests. Please wait a moment.' });
    }

    const body = await readJsonBody(request);
    if (!body) {
      return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
    }

    const messages = Array.isArray(body.messages)
      ? body.messages.filter(
          (m) => isRole(m?.role) && typeof m.content === 'string' && m.content.trim()
        )
      : [];

    if (messages.length === 0) {
      return NextResponse.json({ error: 'Messages are required.' }, { status: 400 });
    }

    const config = resolveAiConfig(body.config);
    if (!config) {
      return NextResponse.json({ error: 'AI is not configured.' }, { status: 400 });
    }

    const content = await sendChatCompletion(config, messages, {
      temperature: body.temperature,
      maxTokens: body.maxTokens,
    });

    return NextResponse.json({ content }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const { status, message, headers } = toPublicApiError(error, {
      context: 'api/ai/chat',
      fallbackMessage: 'AI request failed.',
      fallbackStatus: 500,
    });
    return NextResponse.json(
      { error: message },
      { status, headers: { 'Cache-Control': 'no-store', ...headers } }
    );
  }
}

/** Parse a JSON object body. Returns null for malformed/non-object JSON. */
async function readJsonBody(request: Request): Promise<Body | null> {
  try {
    const parsed = (await request.json()) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    return parsed as Body;
  } catch {
    return null;
  }
}

function isRole(role: unknown): role is AiMessageRole {
  return role === 'system' || role === 'user' || role === 'assistant';
}
