import { NextRequest, NextResponse } from 'next/server';
import {
  analyzeActionCall,
  listActionCalls,
  triggerActionCallScan,
} from '@/lib/adapters/python-agent/client';
import { requireCronBearer } from '@/lib/shared/security/request-auth';
import { rateLimit, getClientIp, rateLimitedResponse } from '@/lib/shared/security/rate-limit';
import { apiErrorResponse } from '@/lib/shared/http/error-response';

/**
 * BFF for Python Action Call.
 *
 * GET  /api/action-call?symbol=BTCUSDT[&multi_timeframe=false]
 * GET  /api/action-call?limit=50                       → latest stored calls
 * POST /api/action-call { symbols?: string[] }         → trigger scan (CRON_SECRET)
 */
export async function GET(request: NextRequest) {
  const ip = getClientIp(request);
  if (!rateLimit(`action-call-get:${ip}`, 60_000, 60)) {
    return rateLimitedResponse({ ok: false, error: 'Too many requests' }, { 'Retry-After': '60' });
  }

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
  const denied = requireCronBearer(request);
  if (denied) return denied;

  const ip = getClientIp(request);
  if (!rateLimit(`action-call-post:${ip}`, 60_000, 5)) {
    return rateLimitedResponse({ ok: false, error: 'Too many requests' }, { 'Retry-After': '60' });
  }

  // Empty or unparseable body → full-universe scan (unchanged behaviour).
  const body = (await request.json().catch(() => ({}))) as { symbols?: unknown } | null;
  const validated = validateSymbols(body && typeof body === 'object' ? body.symbols : undefined);
  if (!validated.ok) {
    return NextResponse.json(
      { ok: false, error: 'symbols must be an array of strings' },
      { status: 400 }
    );
  }

  try {
    const data = await triggerActionCallScan(validated.symbols);
    return NextResponse.json(data);
  } catch (err) {
    return agentErrorResponse(err);
  }
}

/** `undefined` (absent) means "scan the full universe", as the Python API does. */
function validateSymbols(raw: unknown): { ok: true; symbols?: string[] } | { ok: false } {
  if (raw === undefined || raw === null) return { ok: true };
  if (!Array.isArray(raw) || !raw.every((s) => typeof s === 'string')) return { ok: false };
  return { ok: true, symbols: raw as string[] };
}

function agentErrorResponse(err: unknown) {
  return apiErrorResponse(err, {
    context: 'api/action-call',
    fallbackMessage: 'Action call failed',
    fallbackStatus: 502,
  });
}
