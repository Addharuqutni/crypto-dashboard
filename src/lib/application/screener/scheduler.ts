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
import { getScreenerStorage } from './storage-factory';
import { evaluateAlertPolicy } from './alert-policy';
import { auditTopCandidates, AuditCache } from './ai-auditor';
import { aiValidationOptionsFromSettings } from './ai-level-validator';
import { readAiConfigFromEnv } from '@/lib/application/agent/ai-config';
import type { ScreenerAiAuditSummary } from './types';

let started = false;
let intervalHandle: ReturnType<typeof setInterval> | null = null;
let cycleRunning = false;

const store = getScreenerStorage();
const auditCache = new AuditCache();

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
  if (cycleRunning) {
    console.warn('[screener.scheduler] previous cycle still running; skipping tick');
    return;
  }

  cycleRunning = true;

  try {
    console.info('[screener.scheduler] cycle start');

    const run = await runScreenerCycle(DEFAULT_SCREENER_CONFIG);
    const settings = await store.readSettings();
    const ranked = rankScreenerResults(run.results, settings);

    // Optional AI audit (fail-soft).
    let audits: Record<string, ScreenerAiAuditSummary> | undefined;
    const aiConfig = readAiConfigFromEnv();
    if (aiConfig) {
      try {
        const auditMap = await auditTopCandidates(ranked, aiConfig, {
          topN: 3,
          cache: auditCache,
          validationOptions: aiValidationOptionsFromSettings(settings),
        });
        if (auditMap.size > 0) audits = Object.fromEntries(auditMap);
      } catch (err) {
        console.warn('[screener.scheduler] AI audit failed:', err instanceof Error ? err.message : err);
      }
    }

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
      audits,
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
      if (shouldPersistAlertRecord(decision.record.status)) {
        await store.appendAlert(decision.record);
      }
    }

    const triggered = decisions.filter((d) => d.shouldAlert).length;
    console.info(
      `[screener.scheduler] cycle done evaluated=${run.health.evaluatedSymbols} failed=${run.health.failedSymbols} alerts_triggered=${triggered}`
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown error';
    console.error('[screener.scheduler] cycle error:', msg);
  } finally {
    cycleRunning = false;
  }
}

/**
 * Decide whether a local alert record is worth persisting.
 * Neutral skipped and low-quality blocks are already represented by latest
 * result block reasons, so persisting them every cycle creates noise.
 */
function shouldPersistAlertRecord(status: string): boolean {
  return (
    status === 'triggered' ||
    status === 'suppressed_cooldown' ||
    status === 'suppressed_hourly_cap'
  );
}
