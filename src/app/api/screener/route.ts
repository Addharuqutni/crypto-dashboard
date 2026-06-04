import { NextResponse } from 'next/server';
import { DEFAULT_SCREENER_CONFIG, DEFAULT_SCREENER_ALERT_SETTINGS } from '@/lib/application/screener/config';
import { runScreenerCycle } from '@/lib/application/screener/runner';
import { rankScreenerResults } from '@/lib/application/screener/ranker';
import { defaultScreenerStore } from '@/lib/application/screener/store';
import { getDefaultUniverse } from '@/lib/application/screener/universe';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * GET /api/screener — serves screener data to the UI.
 *
 * Vercel/serverless compatibility:
 * - Default mode runs an on-demand read-only screener cycle and returns the
 *   result directly. No filesystem write or background scheduler is required.
 * - File mode remains available for cPanel/VPS workers by setting
 *   SCREENER_STORAGE_MODE=file.
 */
export async function GET() {
  const mode = process.env.SCREENER_STORAGE_MODE ?? 'on-demand';

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
    const store = defaultScreenerStore();
    const [latest, settings, recentAlerts] = await Promise.all([
      store.readLatest(),
      store.readSettings(),
      store.readRecentAlerts(50),
    ]);

    return NextResponse.json({
      ok: true,
      mode: 'file',
      latest,
      settings,
      recentAlerts,
    });
  } catch (err: unknown) {
    console.error('[api/screener] failed to read screener data:', err);
    return NextResponse.json(
      { ok: false, error: 'Failed to read screener data' },
      { status: 500 }
    );
  }
}

function getVercelUniverse() {
  const raw = process.env.SCREENER_SYMBOLS;
  const fallback = DEFAULT_SCREENER_CONFIG.symbols.slice(0, 4);
  if (!raw?.trim()) return fallback;

  const allowed = new Map(getDefaultUniverse().map((coin) => [coin.symbol, coin]));
  const selected = raw
    .split(',')
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean)
    .map((symbol) => allowed.get(symbol))
    .filter((coin): coin is NonNullable<typeof coin> => Boolean(coin))
    .slice(0, getEnvInt('SCREENER_MAX_SYMBOLS', 10, 1, 20));

  return selected.length > 0 ? selected : fallback;
}

function getEnvInt(name: string, fallback: number, min: number, max: number): number {
  const raw = process.env[name];
  const parsed = raw ? Number.parseInt(raw, 10) : fallback;
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}
