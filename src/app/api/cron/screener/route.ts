import { NextResponse } from "next/server";
import { DEFAULT_SCREENER_CONFIG } from '@/lib/application/screener/config';
import { runScreenerCycle } from '@/lib/application/screener/runner';
import { rankScreenerResults } from '@/lib/application/screener/ranker';
import { evaluateAlertPolicy } from '@/lib/application/screener/alert-policy';
import { auditTopCandidates, AuditCache } from '@/lib/application/screener/ai-auditor';
import { aiValidationOptionsFromSettings } from '@/lib/application/screener/ai-level-validator';
import { readAiConfigFromEnv } from '@/lib/application/agent/ai-config';
import { getScreenerStorage } from '@/lib/application/screener/storage-factory';
import { getScreenerUniverseFromEnv } from '@/lib/application/screener/universe';
import type { ScreenerAiAuditSummary } from '@/lib/application/screener/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Module-scoped audit cache survives warm invocations on the same instance.
const auditCache = new AuditCache();

/**
 * GET /api/cron/screener — Vercel Cron entrypoint.
 *
 * Runs one screener cycle in-process (no subprocess, no tsx) and persists the
 * result via the configured storage backend (Supabase on Vercel). Mirrors the
 * scheduler's runCycle so file-mode reads (/api/screener) and cron writes use
 * the exact same data shape.
 *
 * Secured by CRON_SECRET when set — Vercel injects it as a Bearer header.
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET?.trim();

  if (!cronSecret) {
    console.error('[cron.screener] CRON_SECRET is required for this endpoint.');
    return NextResponse.json({ error: "Cron secret is not configured" }, { status: 500 });
  }

  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const store = getScreenerStorage();
  const startedAt = Date.now();

  try {
    const config = buildCronScreenerConfig();
    console.info(
      `[cron.screener] cycle start symbols=${config.symbols.length} candleLimit=${config.candleLimit} concurrency=${config.maxConcurrentSymbols}`
    );

    const run = await runScreenerCycle(config);
    const settings = await store.readSettings();
    const ranked = rankScreenerResults(run.results, settings);

    // Optional AI audit (fail-soft, never decides actions).
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
        console.warn(
          '[cron.screener] AI audit failed:',
          err instanceof Error ? err.message : err
        );
      }
    }

    // Persist latest snapshot.
    await store.writeLatest({
      completedAt: Date.now(),
      health: run.health,
      results: ranked,
      timeframes: {
        setup: config.setupTimeframe,
        trigger: config.triggerTimeframe,
        macro: config.macroTimeframe,
      },
      universeSize: config.symbols.length,
      audits,
    });

    // Append history.
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

    // Alert policy.
    const recentAlerts = await store.readRecentAlerts(50);
    const decisions = evaluateAlertPolicy(ranked, {
      settings,
      recentAlerts,
      now: Date.now(),
    });

    let triggered = 0;
    for (const decision of decisions) {
      if (shouldPersistAlertRecord(decision.record.status)) {
        await store.appendAlert(decision.record);
      }
      if (decision.shouldAlert) triggered += 1;
    }

    const durationMs = Date.now() - startedAt;
    console.info(
      `[cron.screener] cycle done evaluated=${run.health.evaluatedSymbols} failed=${run.health.failedSymbols} alerts_triggered=${triggered} durationMs=${durationMs}`
    );

    return NextResponse.json({
      success: true,
      evaluatedSymbols: run.health.evaluatedSymbols,
      failedSymbols: run.health.failedSymbols,
      alertsTriggered: triggered,
      durationMs,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[cron.screener] cycle failed:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}

/**
 * Decide whether a local alert record is worth persisting. Mirrors the
 * scheduler so cron and in-process scheduler produce identical alert history.
 */
function shouldPersistAlertRecord(status: string): boolean {
  return (
    status === 'triggered' ||
    status === 'suppressed_cooldown' ||
    status === 'suppressed_hourly_cap'
  );
}

function buildCronScreenerConfig() {
  return {
    ...DEFAULT_SCREENER_CONFIG,
    symbols: getCronUniverse(),
    maxConcurrentSymbols: getEnvInt('SCREENER_MAX_CONCURRENT_SYMBOLS', 1, 1, 3),
    candleLimit: getEnvInt('SCREENER_CANDLE_LIMIT', 120, 60, 200),
  };
}

function getCronUniverse() {
  return getScreenerUniverseFromEnv(100);
}

function getEnvInt(name: string, fallback: number, min: number, max: number): number {
  const raw = process.env[name];
  const parsed = raw ? Number.parseInt(raw, 10) : fallback;
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}
