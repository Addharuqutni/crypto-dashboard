import { NextResponse } from 'next/server';
import { testConnection } from '@/lib/adapters/ai/ai-client';
import type { AiConfig } from '@/types/ai';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/ai/test
 *
 * Server-side connection test for OpenAI-compatible providers.
 * Browser-side direct fetch often fails because providers do not expose CORS
 * headers. Testing through a same-origin API route avoids CORS while keeping
 * provider validation and error handling in one place.
 */
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Partial<AiConfig>;
    const config: AiConfig = {
      baseUrl: String(body.baseUrl ?? '').trim(),
      apiKey: String(body.apiKey ?? '').trim(),
      model: String(body.model ?? '').trim(),
    };

    if (!config.baseUrl || !config.apiKey || !config.model) {
      return NextResponse.json(
        { success: false, message: 'Base URL, API key, and model are required.' },
        { status: 400 }
      );
    }

    const result = await testConnection(config);
    return NextResponse.json(result, { status: result.success ? 200 : 400 });
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
