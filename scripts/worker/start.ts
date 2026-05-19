#!/usr/bin/env node
/**
 * Worker CLI entrypoint.
 *
 * Two modes:
 *   - one-shot:  `npm run worker -- --once`
 *   - long-run:  `npm run worker`
 *
 * Long-run mode schedules itself with `setTimeout` rather than `setInterval`
 * so a slow cycle never causes a stampede. SIGINT/SIGTERM are handled
 * gracefully — the in-flight cycle is allowed to complete before exit.
 */

import { loadWorkerConfig, validateWorkerConfig } from '@/lib/application/worker/config';
import { runCycle } from '@/lib/application/worker/runner';
import { WorkerStore } from '@/lib/application/worker/store';
import { hasTelegramCredentials } from '@/lib/application/worker/config';
import type { WorkerConfig } from '@/lib/application/worker/types';

interface CliArgs {
  once: boolean;
  help: boolean;
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = { once: false, help: false };
  for (const arg of argv.slice(2)) {
    if (arg === '--once' || arg === '-1') args.once = true;
    else if (arg === '--help' || arg === '-h') args.help = true;
  }
  return args;
}

function printHelp(): void {
  // eslint-disable-next-line no-console
  console.log(`crypto-dashboard worker

Usage:
  npm run worker             # long-running cycle, restarts on success
  npm run worker -- --once   # single evaluation, exits when done

Environment:
  TELEGRAM_BOT_TOKEN         # required to send alerts
  TELEGRAM_CHAT_ID           # required to send alerts
  WORKER_SYMBOLS             # comma-separated, e.g. "BTCUSDT,ETHUSDT"
  WORKER_INTERVAL_MIN        # cycle interval in minutes (default 15)
  WORKER_MIN_CONFIDENCE      # minimum confidence to alert (default 65)
  WORKER_ALERT_COOLDOWN_MIN  # cooldown per setup, minutes (default 60)
  WORKER_SEND_WAIT_ALERTS    # 'true' to also notify on WAIT (default false)
  WORKER_SEND_HEALTH_ALERTS  # 'true' to forward worker errors (default true)
  WORKER_DATA_DIR            # JSONL/state location (default ./data/worker)
`);
}

function summariseConfig(cfg: WorkerConfig): string {
  return [
    `symbols=${cfg.symbols.join(',')}`,
    `interval=${cfg.intervalMinutes}m`,
    `tfs=${cfg.setupTimeframe}/${cfg.macroTimeframe}/${cfg.triggerTimeframe}`,
    `cooldown=${cfg.alertCooldownMinutes}m`,
    `minConfidence=${cfg.minConfidenceToAlert}`,
    `sendWait=${cfg.sendWaitAlerts}`,
    `sendHealth=${cfg.sendHealthAlerts}`,
    `telegram=${hasTelegramCredentials(cfg) ? 'configured' : 'disabled'}`,
    `dataDir=${cfg.dataDir}`,
  ].join(' ');
}

let stopRequested = false;
let cycleInFlight: Promise<void> | null = null;

async function main(): Promise<void> {
  const args = parseArgs(process.argv);
  if (args.help) {
    printHelp();
    return;
  }

  const cfg = loadWorkerConfig();
  const problems = validateWorkerConfig(cfg);
  if (problems.length > 0) {
    // eslint-disable-next-line no-console
    console.error('[worker] invalid configuration:');
    for (const p of problems) console.error('  -', p);
    process.exit(1);
  }

  // eslint-disable-next-line no-console
  console.log(`[worker] starting (${summariseConfig(cfg)})`);

  const store = new WorkerStore(cfg.dataDir);

  process.on('SIGINT', requestStop);
  process.on('SIGTERM', requestStop);

  if (args.once) {
    await executeOne(cfg, store);
    return;
  }

  // Long-run loop: schedule next cycle via setTimeout to avoid stampedes.
  while (!stopRequested) {
    cycleInFlight = executeOne(cfg, store);
    await cycleInFlight;
    cycleInFlight = null;
    if (stopRequested) break;
    await sleep(cfg.intervalMinutes * 60_000);
  }

  // eslint-disable-next-line no-console
  console.log('[worker] shutdown complete');
}

async function executeOne(cfg: WorkerConfig, store: WorkerStore): Promise<void> {
  try {
    const result = await runCycle(cfg, { store });
    for (const ev of result.evaluations) {
      const meta =
        `action=${ev.signal.action}` +
        ` conf=${Math.round(ev.signal.confidence ?? ev.signal.confidenceScore ?? 0)}` +
        ` grade=${ev.signal.grade ?? 'D'}` +
        ` regime=${ev.signal.marketRegime}` +
        ` permission=${ev.signal.tradePermission}` +
        ` alerted=${ev.log.alerted}` +
        ` reason=${ev.alert.reason}`;
      // eslint-disable-next-line no-console
      console.log(`[worker] ${ev.symbol} ${meta}`);
    }
    if (result.evaluations.length === 0) {
      // eslint-disable-next-line no-console
      console.log('[worker] cycle produced no evaluations (data fetch failed for all symbols)');
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[worker] cycle failed:', err);
  }
}

function requestStop(): void {
  if (stopRequested) return;
  stopRequested = true;
  // eslint-disable-next-line no-console
  console.log('[worker] stop requested, waiting for in-flight cycle to finish');
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    const t = setTimeout(resolve, ms);
    // Allow the process to exit if no other handles are pending.
    if (typeof t.unref === 'function') t.unref();
  });
}

void main();
