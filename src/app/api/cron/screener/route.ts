import { NextResponse } from 'next/server';
import { triggerActionCallScan } from '@/lib/adapters/python-agent/client';
import { requireCronBearer } from '@/lib/shared/security/request-auth';
import { apiErrorResponse, successKeyErrorEnvelope } from '@/lib/shared/http/error-response';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const denied = requireCronBearer(request);
  if (denied) return denied;

  try {
    const result = await triggerActionCallScan();
    return NextResponse.json(
      { success: true, ...result, timestamp: new Date().toISOString() },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (error) {
    // 409 (scan already running) passes through; everything else is sanitised.
    // `success` rather than `ok`: this route's documented contract.
    return apiErrorResponse(error, {
      context: 'api/cron/screener',
      fallbackMessage: 'Python screener failed',
      fallbackStatus: 502,
      envelope: successKeyErrorEnvelope,
    });
  }
}
