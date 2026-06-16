import { NextResponse } from 'next/server';
import { getScreenerStorage } from '@/lib/application/screener/storage-factory';
import { readAiConfigFromEnv } from '@/lib/application/agent/ai-config';
import { runAgentOnLatest } from '@/lib/application/agent/agent-runner';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * GET /api/agent — runs the read-only AI Signal Agent against the latest
 * persisted screener snapshot. It never places orders and never recomputes
 * client-side signals.
 */
export async function GET(request: Request) {
  try {
    const latest = await getScreenerStorage().readLatest();
    if (!latest) {
      return NextResponse.json(
        { ok: false, error: 'No screener snapshot found. Run the screener first.' },
        { status: 404, headers: { 'Cache-Control': 'no-store' } }
      );
    }

    const url = new URL(request.url);
    const topN = clampInt(url.searchParams.get('topN'), 5, 1, 10);
    const result = await runAgentOnLatest(latest, readAiConfigFromEnv(), { topN });

    return NextResponse.json(
      {
        ok: true,
        source: {
          screenerCompletedAt: latest.completedAt,
          universeSize: latest.universeSize,
          timeframes: latest.timeframes,
          aiEnabled: Boolean(readAiConfigFromEnv()),
        },
        result,
      },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (err) {
    console.error('[api/agent] run failed:', err);
    return NextResponse.json(
      { ok: false, error: 'Failed to run agent' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } }
    );
  }
}

function clampInt(raw: string | null, fallback: number, min: number, max: number): number {
  const parsed = raw ? Number.parseInt(raw, 10) : fallback;
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}
