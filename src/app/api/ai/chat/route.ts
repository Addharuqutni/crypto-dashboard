import { NextResponse } from 'next/server';
import { sendChatCompletion } from '@/lib/adapters/ai/ai-client';
import { readAiConfigFromEnv } from '@/lib/application/agent/ai-config';
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
    const body = (await request.json()) as Body;
    const messages = Array.isArray(body.messages)
      ? body.messages.filter(
          (m) => isRole(m?.role) && typeof m.content === 'string' && m.content.trim()
        )
      : [];

    if (messages.length === 0) {
      return NextResponse.json({ error: 'Messages are required.' }, { status: 400 });
    }

    const config = resolveConfig(body.config);
    if (!config) {
      return NextResponse.json({ error: 'AI is not configured.' }, { status: 400 });
    }

    const content = await sendChatCompletion(config, messages, {
      temperature: body.temperature,
      maxTokens: body.maxTokens,
    });

    return NextResponse.json({ content }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'AI request failed.' },
      { status: 500 }
    );
  }
}

function resolveConfig(config?: Partial<AiConfig>): AiConfig | null {
  const local = {
    baseUrl: String(config?.baseUrl ?? '').trim(),
    apiKey: String(config?.apiKey ?? '').trim(),
    model: String(config?.model ?? '').trim(),
  };
  if (local.baseUrl && local.apiKey && local.model) return local;
  return readAiConfigFromEnv();
}

function isRole(role: unknown): role is AiMessageRole {
  return role === 'system' || role === 'user' || role === 'assistant';
}
