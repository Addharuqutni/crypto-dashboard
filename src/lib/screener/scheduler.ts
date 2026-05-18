/**
 * Screener Scheduler — runs the screener loop inside the Next.js server process.
 *
 * Triggered once via `instrumentation.ts` at server startup. The scheduler
 * evaluates all universe coins on a fixed interval (default 5 min) and persists
 * results to disk. The web UI reads persisted data via /api/screener.
 *
 * Design:
 *   - Single instance guard prevents duplicate loops on hot-reload.
 *   - Graceful shutdown on SIGINT/SIGTERM clears the interval.
 *   - Errors in a single cycle are logged but never crash the server.
 *   - Runs only in Node.js runtime (not edge).
 */

import { DEFAULT_SCREENER_CONFIG } from './config';
import { runScreenerCycle } from './runner';
import { rankScreenerResults } from './ranker';
import { ScreenerStore } from './store';
import { evaluateAlertPolicy } from './alert-policy';

let started = false;
let intervalHandle: ReturnType<typeof setInterval> | null = null;

const store = new ScreenerStore();

/**
 * Start the background screener loop. Safe to call multiple times —
 * only the first invocation starts the loop.
 */
export async function startScreenerScheduler(): Promise<void> {
  if (started) return;
  started = true;

  await store.init();

  console.info(
    `[screener.scheduler] started interval=${DEFAULT_SCREENER_CONFIG.intervalMinutes}m symbols=${DEFAULT_SCREENER_CONFIG.symbols.length}`
  );

  // Run immediately on startup, then on interval.
  void runCycle();

  const intervalMs = DEFAULT_SCREENER_CONFIG.intervalMinutes * 60_000;
  intervalHandle = setInterval(() => void runCycle(), intervalMs);

  // Graceful shutdown
  const shutdown = () => {
    if (intervalHandle) {
      clearInterval(intervalHandle);
      intervalHandle = null;
    }
    console.info('[screener.scheduler] stopped');
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

/**
 * Execute one screener cycle: fetch → evaluate → rank → persist → alert policy.
 * Errors are caught and logged — never propagated to crash the server.
 */
async function runCycle(): Promise<void> {
  try {
    console.info('[screener.scheduler] cycle start');

    const run = await runScreenerCycle(DEFAULT_SCREENER_CONFIG);
    const settings = await store.readSettings();
    const ranked = rankScreenerResults(run.results, settings);

    // Persist latest
    await store.writeLatest({
      completedAt: Date.now(),
      health: run.health,
      results: ranked,
      timeframes: {
        setup: DEFAULT_SCREENER_CONFIG.setupTimeframe,
        trigger: DEFAULT_SCREENER_CONFIG.triggerTimeframe,
        macro: DEFAULT_SCREENER_CONFIG.macroTimeframe,
      },
      universeSize: DEFAULT_SCREENER_CONFIG.symbols.length,
    });

    // Append history
    const top = ranked.find((r) => r.alertEligible);
    await store.appendHistory({
      ts: Date.now(),
      status: run.health.status,
      evaluatedSymbols: run.health.evaluatedSymbols,
      failedSymbols: run.health.failedSymbols,
      topSymbol: top?.symbol ?? null,
      topAction: top?.action ?? null,
      topScore: top?.rankingScore ?? null,
    });

    // Alert policy
    const recentAlerts = await store.readRecentAlerts(50);
    const decisions = evaluateAlertPolicy(ranked, {
      settings,
      recentAlerts,
      now: Date.now(),
    });

    for (const decision of decisions) {
      await store.appendAlert(decision.record);
    }

    const eligible = decisions.filter((d) => d.shouldAlert).length;
    console.info(
      `[screener.scheduler] cycle done evaluated=${run.health.evaluatedSymbols} failed=${run.health.failedSymbols} alerts_eligible=${eligible}`
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown error';
    console.error('[screener.scheduler] cycle error:', msg);
  }
}
