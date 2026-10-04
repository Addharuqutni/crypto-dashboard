import { NextResponse } from 'next/server';
import { getScreenerStorage } from '@/lib/application/screener/storage-factory';
import { readAiConfigFromEnv } from '@/lib/application/signal-agent/ai-config';
import { runAgentOnLatest } from '@/lib/application/signal-agent/agent-runner';
import { rateLimit, getClientIp, rateLimitedResponse } from '@/lib/shared/security/rate-limit';
import { toPublicApiError } from '@/lib/shared/http/api-error';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * GET /api/agent — read-only AI Signal Agent over latest screener snapshot.
 * Never places orders. Rate-limited to limit AI credit burn.
 */
export async function GET(request: Request) {
  try {
    const ip = getClientIp(request);
    if (!rateLimit(`agent:${ip}`, 60_000, 10)) {
      return rateLimitedResponse(
        { ok: false, error: 'Too many requests' },
        { 'Cache-Control': 'no-store', 'Retry-After': '60' }
      );
    }

    const latest = await getScreenerStorage().readLatest();
    if (!latest) {
      return NextResponse.json(
        { ok: false, error: 'No screener snapshot found. Run the screener first.' },
        { status: 404, headers: { 'Cache-Control': 'no-store' } }
      );
    }

    const url = new URL(request.url);
    const topN = clampInt(url.searchParams.get('topN'), 5, 1, 10);
    const aiConfig = readAiConfigFromEnv();
    const result = await runAgentOnLatest(latest, aiConfig, { topN });

    return NextResponse.json(
      {
        ok: true,
        source: {
          screenerCompletedAt: latest.completedAt,
          universeSize: latest.universeSize,
          timeframes: latest.timeframes,
          aiEnabled: Boolean(aiConfig),
        },
        result,
      },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (err) {
    const { status, message, headers } = toPublicApiError(err, {
      context: 'api/agent',
      fallbackMessage: 'Failed to run agent',
      fallbackStatus: 500,
    });
    return NextResponse.json(
      { ok: false, error: message },
      { status, headers: { 'Cache-Control': 'no-store', ...headers } }
    );
  }
}

function clampInt(raw: string | null, fallback: number, min: number, max: number): number {
  const parsed = raw ? Number.parseInt(raw, 10) : fallback;
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}
