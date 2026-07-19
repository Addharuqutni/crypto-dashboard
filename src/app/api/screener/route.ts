import { NextResponse } from 'next/server';
import { fetchPythonScreenerLatest, runPythonScreener } from '@/lib/adapters/python-agent/client';
import { DEFAULT_SCREENER_ALERT_SETTINGS } from '@/lib/application/screener/config';
import { readRecentJournalEntries } from '@/lib/application/screener/journal-store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request: Request) {
  if (!allowScreenerRequest(request)) return rateLimitResponse();

  if (resolveScreenerStorageMode() === 'on-demand') {
    return runOnDemandScreener();
  }

  return readPythonSnapshot();
}

async function runOnDemandScreener() {
  try {
    const response = await runPythonScreener();
    return screenerResponse('on-demand', response.latest);
  } catch (error) {
    console.error('[api/screener] Python on-demand run failed:', error);
    return NextResponse.json(
      { ok: false, error: 'Failed to run Python screener' },
      { status: 502 }
    );
  }
}

async function readPythonSnapshot() {
  try {
    const response = await fetchPythonScreenerLatest();
    if (response.latest) return screenerResponse('python', response.latest);
    if (shouldFallbackToOnDemand()) return runOnDemandScreener();
    return screenerResponse('python', null);
  } catch (error) {
    console.error('[api/screener] Python snapshot read failed:', error);
    if (shouldFallbackToOnDemand()) return runOnDemandScreener();
    return NextResponse.json(
      { ok: false, error: 'Failed to read Python screener data' },
      { status: 502 }
    );
  }
}

function screenerResponse(mode: 'python' | 'on-demand', latest: Record<string, unknown> | null) {
  return NextResponse.json({
    ok: true,
    mode,
    latest,
    settings: DEFAULT_SCREENER_ALERT_SETTINGS,
    recentAlerts: [],
    recentActionCalls: [],
    recentJournalEntries: readRecentJournalEntries(100),
  });
}

const RATE_LIMIT_WINDOW_MS = 60_000;
const rateLimitBuckets = new Map<string, { count: number; resetAt: number }>();

export function resolveScreenerStorageMode(): 'file' | 'on-demand' {
  return process.env.SCREENER_STORAGE_MODE?.trim() === 'on-demand' ? 'on-demand' : 'file';
}

function shouldFallbackToOnDemand(): boolean {
  return process.env.SCREENER_FILE_MODE_STRICT !== '1';
}

export function allowScreenerRequest(request: Request, now = Date.now()): boolean {
  const limit = getEnvInt('SCREENER_API_RATE_LIMIT_PER_MINUTE', 30, 1, 300);
  const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  const key = forwarded || request.headers.get('x-real-ip') || 'local';
  const bucket = rateLimitBuckets.get(key);

  pruneExpiredRateLimitBuckets(now);
  if (!bucket || bucket.resetAt <= now) {
    rateLimitBuckets.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }
  if (bucket.count >= limit) return false;
  bucket.count += 1;
  return true;
}

function getEnvInt(name: string, fallback: number, min: number, max: number): number {
  const raw = process.env[name];
  const parsed = raw ? Number.parseInt(raw, 10) : fallback;
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function rateLimitResponse() {
  return NextResponse.json(
    { ok: false, error: 'Too many screener requests' },
    { status: 429, headers: { 'Retry-After': '60' } }
  );
}

function pruneExpiredRateLimitBuckets(now: number): void {
  if (rateLimitBuckets.size < 1_000) return;
  for (const [key, bucket] of rateLimitBuckets) {
    if (bucket.resetAt <= now) rateLimitBuckets.delete(key);
  }
}
