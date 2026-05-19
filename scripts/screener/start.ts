#!/usr/bin/env node
/**
 * Screener CLI entrypoint.
 *
 * One-shot:  npm run screener -- --once
 * Long-run:  npm run screener
 *
 * Persists latest ranked results, run history, and local dashboard alert
 * events. No external delivery is performed by the screener.
 */

import { DEFAULT_SCREENER_CONFIG } from '@/lib/application/screener/config';
import { rankScreenerResults } from '@/lib/application/screener/ranker';
import { runScreenerCycle } from '@/lib/application/screener/runner';
import { ScreenerStore } from '@/lib/application/screener/store';
import type { ScreenerLatestRun, ScreenerHistoryEntry } from '@/lib/application/screener/store';
import { evaluateAlertPolicy } from '@/lib/application/screener/alert-policy';
import type { RankedScreenerResult, ScreenerConfig } from '@/lib/application/screener/types';
import { auditTopCandidates, AuditCache } from '@/lib/application/screener/ai-auditor';
import { aiValidationOptionsFromSettings } from '@/lib/application/screener/ai-level-validator';
import { cleanupScreenerStorage, DEFAULT_RETENTION_CONFIG } from '@/lib/application/screener/maintenance';
import type { AiConfig } from '@/types/ai';
import * as path from 'node:path';

interface CliArgs {
  once: boolean;
  help: boolean;
  cleanup: boolean;
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = { once: false, help: false, cleanup: false };
  for (const arg of argv.slice(2)) {
    if (arg === '--once' || arg === '-1') args.once = true;
    if (arg === '--help' || arg === '-h') args.help = true;
    if (arg === '--cleanup') args.cleanup = true;
  }
  return args;
}

function printHelp(): void {
  // eslint-disable-next-line no-console
  console.log(`crypto-dashboard screener

Usage:
  npm run screener              # long-running cycle
  npm run screener -- --once    # single evaluation, exits when done
  npm run screener -- --cleanup # run retention cleanup, exits when done

Defaults:
  universe: BTC, ETH, BNB, SOL, XRP, ADA, DOGE, AVAX, TRX, LINK
  timeframes: setup=30m macro=4h trigger=15m
  interval: 15m
  maxConcurrentSymbols: 3
  persistence: ./data/screener/
  retention: history=${DEFAULT_RETENTION_CONFIG.historyRetentionDays}d alerts=${DEFAULT_RETENTION_CONFIG.alertRetentionDays}d

Optional AI auditor (fail-soft, never decides actions):
  AI_BASE_URL, AI_API_KEY, AI_MODEL
`);
}

let stopRequested = false;

async function main(): Promise<void> {
  const args = parseArgs(process.argv);
  if (args.help) {
    printHelp();
    return;
  }

  if (args.cleanup) {
    await runCleanup();
    return;
  }

  process.on('SIGINT', requestStop);
  process.on('SIGTERM', requestStop);

  const cfg = DEFAULT_SCREENER_CONFIG;
  const store = new ScreenerStore();
  const aiConfig = readAiConfigFromEnv();
  const auditCache = new AuditCache();

  if (args.once) {
    await executeOnce(cfg, store, aiConfig, auditCache);
    return;
  }

  while (!stopRequested) {
    await executeOnce(cfg, store, aiConfig, auditCache);
    if (stopRequested) break;
    await sleep(cfg.intervalMinutes * 60_000);
  }
}

/** Execute one screener cycle: evaluate → rank → audit → persist → alert policy. */
async function executeOnce(
  cfg: ScreenerConfig,
  store: ScreenerStore,
  aiConfig: AiConfig | null,
  auditCache: AuditCache
): Promise<void> {
  const now = Date.now();

  // eslint-disable-next-line no-console
  console.log(`[screener] starting symbols=${cfg.symbols.map((s) => s.symbol).join(',')} tfs=${cfg.setupTimeframe}/${cfg.macroTimeframe}/${cfg.triggerTimeframe}`);

  // 1. Run the screener cycle.
  const run = await runScreenerCycle(cfg);

  // 2. Read persisted settings (may differ from defaults if user changed them).
  const settings = await store.readSettings();

  // 3. Rank results using persisted settings.
  const ranked = rankScreenerResults(run.results, settings);

  // 4. Optionally audit top candidates with AI (fail-soft).
  let auditsMap: Record<string, import('@/lib/application/screener/types').ScreenerAiAuditSummary> | undefined;
  if (aiConfig) {
    try {
      const audits = await auditTopCandidates(ranked, aiConfig, {
        topN: 3,
        cache: auditCache,
        validationOptions: aiValidationOptionsFromSettings(settings),
      });
      if (audits.size > 0) {
        auditsMap = Object.fromEntries(audits);
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('[screener] AI audit failed (continuing):', err instanceof Error ? err.message : err);
    }
  }

  // 5. Persist latest run.
  const latestRun: ScreenerLatestRun = {
    completedAt: now,
    health: run.health,
    results: ranked,
    timeframes: {
      setup: cfg.setupTimeframe,
      trigger: cfg.triggerTimeframe,
      macro: cfg.macroTimeframe,
    },
    universeSize: cfg.symbols.length,
    audits: auditsMap,
  };
  await store.writeLatest(latestRun);

  // 5. Append history summary.
  const topResult = ranked.find((r) => r.alertEligible);
  const historyEntry: ScreenerHistoryEntry = {
    ts: now,
    status: run.health.status,
    evaluatedSymbols: run.health.evaluatedSymbols,
    failedSymbols: run.health.failedSymbols,
    topSymbol: topResult?.symbol ?? null,
    topAction: topResult?.action ?? null,
    topScore: topResult?.rankingScore ?? null,
  };
  await store.appendHistory(historyEntry);

  // 6. Evaluate alert policy.
  const recentAlerts = await store.readRecentAlerts(100);
  const decisions = evaluateAlertPolicy(ranked, { settings, recentAlerts, now });

  // 7. Persist only useful local alert records; skip neutral/low-quality spam.
  for (const decision of decisions) {
    if (shouldPersistAlertRecord(decision.record.status)) {
      await store.appendAlert(decision.record);
    }
  }

  // 8. Print results.
  for (const row of ranked) {
    printResult(row);
  }

  const alertsTriggered = decisions.filter((d) => d.shouldAlert).length;
  // eslint-disable-next-line no-console
  console.log(`[screener] completed status=${run.health.status} evaluated=${run.health.evaluatedSymbols} failed=${run.health.failedSymbols} alerts_triggered=${alertsTriggered}`);

  for (const error of run.health.errors) {
    // eslint-disable-next-line no-console
    console.warn(`[screener] ${error.symbol} failed: ${error.message}`);
  }
}

function printResult(row: RankedScreenerResult): void {
  const rank = row.rank > 0 ? `#${row.rank}` : '--';
  const rr = row.riskReward == null ? 'n/a' : row.riskReward.toFixed(2);
  const blocks = row.alertBlockReasons.length > 0 ? ` blocks=${row.alertBlockReasons.join('|')}` : '';

  // eslint-disable-next-line no-console
  console.log(
    `[screener] ${rank} ${row.symbol} action=${row.action} conf=${row.confidence} grade=${row.grade} rr=${rr} score=${row.rankingScore.toFixed(1)} eligible=${row.alertEligible}${blocks}`
  );
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

function requestStop(): void {
  stopRequested = true;
  // eslint-disable-next-line no-console
  console.log('[screener] stop requested');
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    const t = setTimeout(resolve, ms);
    if (typeof t.unref === 'function') t.unref();
  });
}

/** Read optional AI config from env. Missing values disable AI cleanly. */
function readAiConfigFromEnv(): AiConfig | null {
  const baseUrl = process.env.AI_BASE_URL;
  const apiKey = process.env.AI_API_KEY;
  const model = process.env.AI_MODEL;
  if (!baseUrl || !apiKey || !model) return null;
  return { baseUrl, apiKey, model };
}

/** Run storage retention cleanup for JSONL files. Preserves latest/settings. */
async function runCleanup(): Promise<void> {
  const dataDir = path.join(process.cwd(), 'data', 'screener');
  const report = await cleanupScreenerStorage(dataDir);
  // eslint-disable-next-line no-console
  console.log('[screener] cleanup completed', report);
}

void main();
