import { NextResponse } from 'next/server';
import { fetchPythonScreenerLatest, runPythonScreener } from '@/lib/adapters/python-agent/client';
import { DEFAULT_SCREENER_ALERT_SETTINGS } from '@/lib/application/screener/config';
import { readRecentJournalEntries } from '@/lib/application/screener/journal-store';
import { toAlertRecords } from '@/lib/application/screener/to-alerts';
import { getClientIp, rateLimit, rateLimitedResponse } from '@/lib/shared/security/rate-limit';

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
    // The Python engine owns alert policy and stamps every decision into the
    // snapshot, so the panel reads them from there instead of showing an
    // always-empty list.
    recentAlerts: toAlertRecords(latest?.alertDecisions),
    recentActionCalls: [],
    recentJournalEntries: readRecentJournalEntries(100),
  });
}

const RATE_LIMIT_WINDOW_MS = 60_000;

export function resolveScreenerStorageMode(): 'file' | 'on-demand' {
  return process.env.SCREENER_STORAGE_MODE?.trim() === 'on-demand' ? 'on-demand' : 'file';
}

function shouldFallbackToOnDemand(): boolean {
  return process.env.SCREENER_FILE_MODE_STRICT !== '1';
}

/** Thin wrapper so the screener route keeps its own env-driven limit. */
export function allowScreenerRequest(request: Request, now = Date.now()): boolean {
  const limit = getEnvInt('SCREENER_API_RATE_LIMIT_PER_MINUTE', 30, 1, 300);
  return rateLimit(`screener:${getClientIp(request)}`, RATE_LIMIT_WINDOW_MS, limit, now);
}

function getEnvInt(name: string, fallback: number, min: number, max: number): number {
  const raw = process.env[name];
  const parsed = raw ? Number.parseInt(raw, 10) : fallback;
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function rateLimitResponse() {
  return rateLimitedResponse({ ok: false, error: 'Too many screener requests' }, { 'Retry-After': '60' });
}
