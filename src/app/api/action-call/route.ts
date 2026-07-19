import { NextRequest, NextResponse } from 'next/server';
import {
  analyzeActionCall,
  listActionCalls,
  PythonAgentError,
  triggerActionCallScan,
} from '@/lib/adapters/python-agent/client';

/**
 * BFF for Python Action Call.
 *
 * GET  /api/action-call?symbol=BTCUSDT[&multi_timeframe=false]
 * GET  /api/action-call?limit=50                       → latest stored calls
 * POST /api/action-call { symbols?: string[] }         → trigger scan
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const symbol = searchParams.get('symbol')?.trim();
  const multiTf = searchParams.get('multi_timeframe') !== 'false';

  try {
    if (symbol) {
      const data = await analyzeActionCall(symbol, { multiTimeframe: multiTf });
      return NextResponse.json(data);
    }

    const limit = Number(searchParams.get('limit') ?? 100);
    const data = await listActionCalls(Number.isFinite(limit) ? limit : 100);
    return NextResponse.json(data);
  } catch (err) {
    return agentErrorResponse(err);
  }
}

export async function POST(request: NextRequest) {
  try {
    // Body is accepted for future per-symbol scans; current Python endpoint
    // scans the configured universe.
    await request.json().catch(() => ({}));
    const data = await triggerActionCallScan();
    return NextResponse.json(data);
  } catch (err) {
    return agentErrorResponse(err);
  }
}

function agentErrorResponse(err: unknown) {
  if (err instanceof PythonAgentError) {
    return NextResponse.json(
      { ok: false, error: err.message },
      { status: err.status && err.status >= 400 && err.status < 600 ? err.status : 502 }
    );
  }
  const message = err instanceof Error ? err.message : 'Action call failed';
  return NextResponse.json({ ok: false, error: message }, { status: 502 });
}
