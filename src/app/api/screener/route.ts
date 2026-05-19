import { NextResponse } from 'next/server';
import { defaultScreenerStore } from '@/lib/application/screener/store';

/**
 * GET /api/screener — serves the latest screener snapshot to the UI.
 *
 * Reads from the persisted `latest.json` file produced by the screener
 * worker. Returns an empty-state payload when no run exists yet, so the
 * UI can always render without error.
 *
 * This route is intentionally read-only and requires no authentication
 * because the data is non-sensitive market analysis.
 */
export async function GET() {
  try {
    const store = defaultScreenerStore();
    const [latest, settings, recentAlerts] = await Promise.all([
      store.readLatest(),
      store.readSettings(),
      store.readRecentAlerts(50),
    ]);

    return NextResponse.json({
      ok: true,
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
