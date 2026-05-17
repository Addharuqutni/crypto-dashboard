import type { Candle } from '@/types/chart';
import { generateFuturesSignal } from '@/lib/analysis/futures-signal-engine';
import type {
  FuturesSignal,
  FuturesSignalInput,
} from '@/types/futures-signal';
import { fetchKlines, KlineFetchError } from './binance';
import {
  decide,
  decideHealthAlert,
  makeRecord,
} from './dedupe';
import { formatHealthAlert, formatTradeAlert } from './formatter';
import { recordAlert, truncateError, WorkerStore } from './store';
import { sendTelegramMessage } from './telegram';
import type {
  AlertDecision,
  EvaluationResult,
  WorkerConfig,
  WorkerHealth,
  WorkerSignalLogEntry,
} from './types';

/**
 * Worker orchestrator.
 *
 *   runCycle()
 *     → fetch klines for every symbol (15m + 30m + 4H)
 *     → run the deterministic signal engine
 *     → consult dedupe + cooldown
 *     → send Telegram alert when allowed
 *     → append JSONL signal log
 *     → atomically rewrite state.json
 *
 * Pure-ish design: file I/O happens through `WorkerStore`, network I/O
 * through `fetchKlines`/`sendTelegramMessage`. Both are injectable through
 * `RunCycleDeps` so the unit tests run without disk or network.
 */

export interface RunCycleDeps {
  store: WorkerStore;
  fetchKlinesFn?: typeof fetchKlines;
  sendTelegramFn?: typeof sendTelegramMessage;
  generateSignalFn?: typeof generateFuturesSignal;
  /** Reference time. Defaults to `Date.now()`. */
  now?: () => number;
}

export interface RunCycleResult {
  evaluations: EvaluationResult[];
  health: WorkerHealth;
}

/**
 * Run a single evaluation cycle across every configured symbol.
 *
 * Errors during one symbol do not block the others — each symbol's failure
 * is captured into the health snapshot and a single health-alert kind is
 * fired through the rate limiter. The function never throws to its caller.
 */
export async function runCycle(
  cfg: WorkerConfig,
  deps: RunCycleDeps
): Promise<RunCycleResult> {
  const fetchKlinesImpl = deps.fetchKlinesFn ?? fetchKlines;
  const sendTelegramImpl = deps.sendTelegramFn ?? sendTelegramMessage;
  const engine = deps.generateSignalFn ?? generateFuturesSignal;
  const now = deps.now ?? Date.now;

  await deps.store.init();
  const persisted = await deps.store.readState();
  const health: WorkerHealth = {
    ...persisted.health,
    lastRunAt: now(),
  };
  let dedupe = persisted.dedupe;
  const evaluations: EvaluationResult[] = [];

  for (const symbol of cfg.symbols) {
    health.lastEvaluatedSymbol = symbol;

    let candles: { setup: Candle[]; macro: Candle[]; trigger: Candle[] };
    try {
      candles = await fetchAllTimeframes(symbol, cfg, fetchKlinesImpl);
    } catch (err) {
      health.consecutiveErrors += 1;
      health.lastErrorAt = now();
      health.lastError = truncateError(err);
      // Health alert on persistent failure — rate-limited per-kind per-hour.
      const kind = err instanceof KlineFetchError
        ? `binance_http_${err.status ?? 'network'}`
        : 'binance_unknown';
      const decision = decideHealthAlert(kind, cfg, health.healthAlertsThisHour, now());
      health.healthAlertsThisHour = decision.next;
      if (decision.allow && health.consecutiveErrors >= 2) {
        const message = formatHealthAlert({
          symbol,
          reason: health.lastError ?? 'data fetch failed',
          consecutiveErrors: health.consecutiveErrors,
          lastSuccessAt: health.lastSuccessAt,
        });
        const result = await sendTelegramImpl(message, cfg);
        health.lastDeliveryStatus = result.ok ? 'sent' : result.reason === 'disabled' ? 'disabled' : 'failed';
      } else {
        health.lastDeliveryStatus = 'skipped';
      }
      continue;
    }

    // Build engine input pinned to the last setup-candle's close so the
    // data-health gate evaluates freshness deterministically.
    const lastSetup = candles.setup[candles.setup.length - 1];
    const nowMs = lastSetup ? lastSetup.closeTime : now();
    const engineInput: FuturesSignalInput = {
      symbol,
      timeframe: cfg.setupTimeframe,
      candles: candles.setup,
      macroCandles: candles.macro,
      triggerCandles: candles.trigger,
      nowMs,
    };

    const signal = engine(engineInput);
    health.lastSignalAction = signal.action;

    // Successful evaluation resets the consecutive-error counter.
    health.consecutiveErrors = 0;
    health.lastSuccessAt = now();
    health.lastError = null;

    const alertDecision = decide(symbol, signal, cfg, dedupe, now());
    let alerted = false;
    let alertReason: string | undefined;
    let deliveryStatus: WorkerHealth['lastDeliveryStatus'] = 'skipped';

    if (alertDecision.emit) {
      const message = formatTradeAlert({
        symbol,
        setupTimeframe: cfg.setupTimeframe,
        macroTimeframe: cfg.macroTimeframe,
        signal,
      });
      const result = await sendTelegramImpl(message, cfg);
      if (result.ok) {
        alerted = true;
        deliveryStatus = 'sent';
        alertReason = alertDecision.reason;
        dedupe = recordAlert(dedupe, makeRecord(symbol, signal, now()));
      } else if (result.reason === 'disabled') {
        deliveryStatus = 'disabled';
        alertReason = `delivery_disabled (${alertDecision.reason})`;
      } else {
        deliveryStatus = 'failed';
        alertReason = `delivery_failed (${alertDecision.reason})`;
        if (!cfg.continueOnTelegramFailure) {
          health.lastDeliveryStatus = deliveryStatus;
          await persistAndFlush(deps.store, { health, dedupe }, evaluations);
          throw new Error(`Telegram delivery failed: ${result.reason}`);
        }
      }
    } else {
      alertReason = alertDecision.reason;
    }

    health.lastDeliveryStatus = deliveryStatus;

    const log = makeLogEntry(symbol, cfg, signal, alerted, alertReason, now());
    await deps.store.appendSignal(log);

    evaluations.push({
      symbol,
      signal,
      alert: alertDecision satisfies AlertDecision,
      log,
    });
  }

  await deps.store.writeState({ health, dedupe });
  return { evaluations, health };
}

async function persistAndFlush(
  store: WorkerStore,
  state: { health: WorkerHealth; dedupe: import('./types').AlertDedupeState },
  pending: EvaluationResult[]
): Promise<void> {
  for (const ev of pending) {
    await store.appendSignal(ev.log);
  }
  await store.writeState(state);
}

async function fetchAllTimeframes(
  binanceSymbol: string,
  cfg: WorkerConfig,
  fetcher: typeof fetchKlines
): Promise<{ setup: Candle[]; macro: Candle[]; trigger: Candle[] }> {
  const [setup, macro, trigger] = await Promise.all([
    fetcher({ binanceSymbol, interval: cfg.setupTimeframe, limit: 300 }),
    fetcher({ binanceSymbol, interval: cfg.macroTimeframe, limit: 300 }),
    fetcher({ binanceSymbol, interval: cfg.triggerTimeframe, limit: 300 }),
  ]);
  return { setup, macro, trigger };
}

function makeLogEntry(
  symbol: string,
  cfg: WorkerConfig,
  signal: FuturesSignal,
  alerted: boolean,
  alertReason: string | undefined,
  ts: number
): WorkerSignalLogEntry {
  return {
    ts,
    symbol,
    timeframe: cfg.setupTimeframe,
    action: signal.action,
    marketRegime: signal.marketRegime,
    tradePermission: signal.tradePermission,
    setupType: signal.entryTrigger,
    confidence: signal.confidence ?? signal.confidenceScore ?? 0,
    grade: signal.grade ?? 'D',
    signalGrade: signal.signalGrade,
    entry: signal.entryZone?.min ?? null,
    stopLoss: signal.stopLoss,
    tp1: signal.takeProfits?.tp1 ?? null,
    tp2: signal.takeProfits?.tp2 ?? null,
    tp3: signal.takeProfits?.tp3 ?? null,
    riskRewardRatio: signal.riskRewardRatio,
    invalidation: signal.invalidation ?? null,
    reasons: signal.reasons ?? [],
    warnings: signal.warnings ?? [],
    dataHealthOk: signal.dataHealth?.ok ?? false,
    alerted,
    ...(alertReason ? { alertReason } : {}),
  };
}
