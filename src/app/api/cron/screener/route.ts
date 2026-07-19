import { NextResponse } from 'next/server';
import { triggerActionCallScan, PythonAgentError } from '@/lib/adapters/python-agent/client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return NextResponse.json({ error: 'Cron secret is not configured' }, { status: 500 });
  if (request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const result = await triggerActionCallScan();
    return NextResponse.json({ success: true, ...result, timestamp: new Date().toISOString() });
  } catch (error) {
    const status = error instanceof PythonAgentError && error.status === 409 ? 409 : 502;
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Python screener failed' },
      { status }
    );
  }
}
