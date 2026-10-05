import { NextResponse } from 'next/server';
import { ScreenerStore } from '@/lib/application/screener/store';
import { readAiConfigFromEnv } from '@/lib/application/signal-agent/ai-config';
import { runAgentOnLatest } from '@/lib/application/signal-agent/agent-runner';
import { rateLimit, getClientIp, rateLimitedResponse } from '@/lib/shared/security/rate-limit';
import { apiErrorResponse } from '@/lib/shared/http/error-response';
import { parseBoundedInt } from '@/lib/shared/config/env-int';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * One reader per process. The store holds no mutable state — it resolves the
 * snapshot path in its constructor — so a module-level instance is safe and
 * avoids re-deriving the path on every request.
 */
const screenerStore = new ScreenerStore();

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

    const latest = await screenerStore.readLatest();
    if (!latest) {
      return NextResponse.json(
        { ok: false, error: 'No screener snapshot found. Run the screener first.' },
        { status: 404, headers: { 'Cache-Control': 'no-store' } }
      );
    }

    const url = new URL(request.url);
    const topN = parseBoundedInt(url.searchParams.get('topN'), 5, 1, 10);
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
    return apiErrorResponse(err, {
      context: 'api/agent',
      fallbackMessage: 'Failed to run agent',
      fallbackStatus: 500,
    });
  }
}
