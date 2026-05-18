#!/usr/bin/env node
/**
 * Screener CLI entrypoint — Phase 2.
 *
 * One-shot:  npm run screener -- --once
 * Long-run:  npm run screener
 *
 * Phase 2 adds:
 *   - Persistence via ScreenerStore (latest.json, history.jsonl, alerts.jsonl)
 *   - Alert policy evaluation with cooldown/dedupe
 *   - Optional Telegram delivery (reuses existing worker sender)
 */

import { DEFAULT_SCREENER_CONFIG } from '@/lib/screener/config';
import { rankScreenerResults } from '@/lib/screener/ranker';
import { runScreenerCycle } from '@/lib/screener/runner';
import { ScreenerStore } from '@/lib/screener/store';
import type { ScreenerLatestRun, ScreenerHistoryEntry } from '@/lib/screener/store';
import { evaluateAlertPolicy } from '@/lib/screener/alert-policy';
import type { RankedScreenerResult, ScreenerConfig } from '@/lib/screener/types';

interface CliArgs {
  once: boolean;
  help: boolean;
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = { once: false, help: false };
  for (const arg of argv.slice(2)) {
    if (arg === '--once' || arg === '-1') args.once = true;
    if (arg === '--help' || arg === '-h') args.help = true;
  }
  return args;
}

function printHelp(): void {
  // eslint-disable-next-line no-console
  console.log(`crypto-dashboard screener

Usage:
  npm run screener             # long-running cycle
  npm run screener -- --once   # single evaluation, exits when done

Defaults:
  universe: BTC, ETH, BNB, SOL, XRP, ADA, DOGE, AVAX, TRX, LINK
  timeframes: setup=30m macro=4h trigger=15m
  interval: 15m
  maxConcurrentSymbols: 3
  persistence: ./data/screener/
`);
}

let stopRequested = false;

async function main(): Promise<void> {
  const args = parseArgs(process.argv);
  if (args.help) {
    printHelp();
    return;
  }

  process.on('SIGINT', requestStop);
  process.on('SIGTERM', requestStop);

  const cfg = DEFAULT_SCREENER_CONFIG;
  const store = new ScreenerStore();

  if (args.once) {
    await executeOnce(cfg, store);
    return;
  }

  while (!stopRequested) {
    await executeOnce(cfg, store);
    if (stopRequested) break;
    await sleep(cfg.intervalMinutes * 60_000);
  }
}

/** Execute one screener cycle: evaluate → rank → persist → alert policy. */
async function executeOnce(cfg: ScreenerConfig, store: ScreenerStore): Promise<void> {
  const now = Date.now();

  // eslint-disable-next-line no-console
  console.log(`[screener] starting symbols=${cfg.symbols.map((s) => s.symbol).join(',')} tfs=${cfg.setupTimeframe}/${cfg.macroTimeframe}/${cfg.triggerTimeframe}`);

  // 1. Run the screener cycle.
  const run = await runScreenerCycle(cfg);

  // 2. Read persisted settings (may differ from defaults if user changed them).
  const settings = await store.readSettings();

  // 3. Rank results using persisted settings.
  const ranked = rankScreenerResults(run.results, settings);

  // 4. Persist latest run.
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

  // 7. Persist alert records (both sent and skipped for observability).
  for (const decision of decisions) {
    await store.appendAlert(decision.record);
  }

  // 8. Print results.
  for (const row of ranked) {
    printResult(row);
  }

  const alertsSent = decisions.filter((d) => d.shouldAlert).length;
  // eslint-disable-next-line no-console
  console.log(`[screener] completed status=${run.health.status} evaluated=${run.health.evaluatedSymbols} failed=${run.health.failedSymbols} alerts_eligible=${alertsSent}`);

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

void main();
