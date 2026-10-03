import { NextResponse } from 'next/server';
import { triggerActionCallScan, PythonAgentError } from '@/lib/adapters/python-agent/client';
import { requireCronBearer } from '@/lib/shared/security/request-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const denied = requireCronBearer(request);
  if (denied) return denied;

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
