import { NextResponse } from 'next/server';
import { readAiConfigFromEnv } from '@/lib/application/signal-agent/ai-config';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const config = readAiConfigFromEnv();
  return NextResponse.json(
    config
      ? { configured: true, baseUrl: config.baseUrl, model: config.model }
      : { configured: false },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
