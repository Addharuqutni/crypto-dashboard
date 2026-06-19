import { NextResponse } from 'next/server';
import { DEFAULT_SCREENER_CONFIG, DEFAULT_SCREENER_ALERT_SETTINGS } from '@/lib/application/screener/config';
import { runScreenerCycle } from '@/lib/application/screener/runner';
import { rankScreenerResults } from '@/lib/application/screener/ranker';
import { getScreenerStorage } from '@/lib/application/screener/storage-factory';
import { getScreenerUniverseFromEnv } from '@/lib/application/screener/universe';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * GET /api/screener — serves screener data to the UI.
 *
 * Vercel/serverless compatibility:
 * - Production defaults to file mode so the API serves persisted worker output.
 * - Development defaults to on-demand mode for easier local setup.
 * - Explicit SCREENER_STORAGE_MODE=file|on-demand always wins.
 */
export async function GET(request: Request) {
  const mode = resolveScreenerStorageMode();

  if (!allowScreenerRequest(request)) return rateLimitResponse();

  if (mode === 'file') {
    return readFromFileStore();
  }

  return runOnDemandScreener();
}

async function runOnDemandScreener() {
  try {
    const startedAt = Date.now();
    const settings = { ...DEFAULT_SCREENER_ALERT_SETTINGS };
    const config = {
      ...DEFAULT_SCREENER_CONFIG,
      symbols: getVercelUniverse(),
      maxConcurrentSymbols: getEnvInt('SCREENER_MAX_CONCURRENT_SYMBOLS', 1, 1, 3),
      candleLimit: getEnvInt('SCREENER_CANDLE_LIMIT', 120, 60, 200),
      alertSettings: settings,
    };

    const run = await runScreenerCycle(config);
    const ranked = rankScreenerResults(run.results, settings);
    const completedAt = Date.now();

    return NextResponse.json(
      {
        ok: true,
        mode: 'on-demand',
        latest: {
          completedAt,
          health: run.health,
          results: ranked,
          timeframes: {
            setup: config.setupTimeframe,
            trigger: config.triggerTimeframe,
            macro: config.macroTimeframe,
          },
          universeSize: config.symbols.length,
        },
        settings,
        recentAlerts: [],
        meta: {
          durationMs: completedAt - startedAt,
          storage: 'memory',
        },
      },
      {
        headers: {
          'Cache-Control': 's-maxage=60, stale-while-revalidate=240',
        },
      }
    );
  } catch (err: unknown) {
    console.error('[api/screener] on-demand run failed:', err);
    return NextResponse.json(
      { ok: false, error: 'Failed to run screener' },
      { status: 500 }
    );
  }
}

async function readFromFileStore() {
  try {
    const store = getScreenerStorage();
    const [latest, settings, recentAlerts] = await Promise.all([
      store.readLatest(),
      store.readSettings(),
      store.readRecentAlerts(50),
    ]);

    if (!latest && shouldFallbackToOnDemand()) {
      return runOnDemandScreener();
    }

    return NextResponse.json({
      ok: true,
      mode: 'file',
      latest,
      settings,
      recentAlerts,
    });
  } catch (err: unknown) {
    console.error('[api/screener] failed to read screener data:', err);
    if (shouldFallbackToOnDemand()) {
      return runOnDemandScreener();
    }
    return NextResponse.json(
      { ok: false, error: 'Failed to read screener data' },
      { status: 500 }
    );
  }
}

function getVercelUniverse() {
  return getScreenerUniverseFromEnv(100);
}

function getEnvInt(name: string, fallback: number, min: number, max: number): number {
  const raw = process.env[name];
  const parsed = raw ? Number.parseInt(raw, 10) : fallback;
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

const RATE_LIMIT_WINDOW_MS = 60_000;
const rateLimitBuckets = new Map<string, { count: number; resetAt: number }>();

export function resolveScreenerStorageMode(): 'file' | 'on-demand' {
  const raw = process.env.SCREENER_STORAGE_MODE?.trim();
  if (raw === 'file' || raw === 'on-demand') return raw;
  if (isServerlessRuntime()) return 'file';
  return process.env.NODE_ENV === 'production' ? 'file' : 'on-demand';
}

function shouldFallbackToOnDemand(): boolean {
  if (process.env.SCREENER_FILE_MODE_STRICT === '1') return false;
  if (process.env.SCREENER_REQUIRE_DATABASE === '1') return false;
  if (isServerlessRuntime()) return false;
  return true;
}

function isServerlessRuntime(): boolean {
  return (
    process.env.VERCEL === '1' ||
    process.env.VERCEL === 'true' ||
    Boolean(process.env.AWS_LAMBDA_FUNCTION_NAME) ||
    process.env.LAMBDA_TASK_ROOT === '/var/task' ||
    Boolean(process.env.NOW_REGION)
  );
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
