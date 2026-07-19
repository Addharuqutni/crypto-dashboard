import type { ActionCallView } from '@/types/action-call';
import { fetchPythonActionCall } from '@/lib/adapters/python-agent/client';
import { hasTelegramCredentials } from './config';
import { decide, decideHealthAlert, makeRecord } from './dedupe';
import { formatHealthAlert, formatTradeAlert } from './formatter';
import { WorkerStore, recordAlert } from './store';
import { sendTelegramMessage } from './telegram';
import type {
  AlertDedupeState,
  EvaluationResult,
  WorkerConfig,
  WorkerHealth,
  WorkerSignalLogEntry,
} from './types';

/**
 * Worker orchestrator — Python Action Call backend.
 *
 * Each cycle:
 *   1. Call Python agent for every configured symbol.
 *   2. Run the alert through the dedupe layer.
 *   3. Append a JSONL log entry.
 *   4. Deliver to Telegram when the decision is `emit`.
 *   5. Persist health + dedupe state.
 */

export interface RunCycleDeps {
  store?: WorkerStore;
  now?: () => number;
  analyze?: (symbol: string) => Promise<ActionCallView>;
  send?: typeof sendTelegramMessage;
  log?: (msg: string, meta?: Record<string, unknown>) => void;
}

export interface CycleOutcome {
  evaluations: EvaluationResult[];
  health: WorkerHealth;
  dedupe: AlertDedupeState;
}

/** CLI-facing alias kept for scripts/worker/start.ts. */
export async function runCycle(cfg: WorkerConfig, deps: RunCycleDeps = {}): Promise<CycleOutcome> {
  return runWorkerCycle(cfg, deps);
}

async function runWorkerCycle(cfg: WorkerConfig, deps: RunCycleDeps = {}): Promise<CycleOutcome> {
  const now = deps.now ?? Date.now;
  const analyze = deps.analyze ?? defaultAnalyze;
  const send = deps.send ?? sendTelegramMessage;
  const log = deps.log ?? ((msg) => console.info(`[worker] ${msg}`));
  const store = deps.store ?? new WorkerStore(cfg.dataDir);

  await store.init();
  const state = await store.readState();

  const startedAt = now();
  const evaluations: EvaluationResult[] = [];
  let health: WorkerHealth = {
    ...state.health,
    lastRunAt: startedAt,
    lastError: null,
  };
  let dedupe: AlertDedupeState = { ...state.dedupe };

  for (const symbol of cfg.symbols) {
    try {
      const signal = await analyze(symbol);
      const decision = decide(symbol, signal, cfg, dedupe, now());

      const logEntry = buildLogEntry(symbol, cfg, signal, decision.emit, decision.reason, now());
      await store.appendSignal(logEntry);

      let deliveryStatus: WorkerHealth['lastDeliveryStatus'] = 'skipped';

      if (decision.emit) {
        if (!hasTelegramCredentials(cfg)) {
          deliveryStatus = 'disabled';
          log(`alert skipped (telegram disabled)`, { symbol, action: signal.action });
        } else {
          const text = formatTradeAlert({
            symbol,
            setupTimeframe: cfg.setupTimeframe,
            macroTimeframe: cfg.macroTimeframe,
            signal,
          });
          const delivery = await send(text, cfg);
          if (delivery.ok) {
            deliveryStatus = 'sent';
            const record = makeRecord(symbol, signal, now());
            dedupe = recordAlert(dedupe, record);
            log(`alert sent`, {
              symbol,
              action: signal.action,
              grade: signal.signalGrade,
            });
          } else {
            deliveryStatus = delivery.reason === 'disabled' ? 'disabled' : 'failed';
            health = {
              ...health,
              lastErrorAt: now(),
              lastError: delivery.reason ?? 'telegram delivery failed',
              consecutiveErrors: health.consecutiveErrors + 1,
            };
            log(`telegram delivery failed`, { symbol, reason: delivery.reason });
            if (!cfg.continueOnTelegramFailure && deliveryStatus === 'failed') {
              throw new Error(`Telegram delivery failed: ${delivery.reason}`);
            }
          }
        }
      }

      health = {
        ...health,
        lastSuccessAt: now(),
        consecutiveErrors: deliveryStatus === 'failed' ? health.consecutiveErrors : 0,
        lastEvaluatedSymbol: symbol,
        lastSignalAction: signal.action,
        lastDeliveryStatus: deliveryStatus,
      };

      evaluations.push({
        symbol,
        signal,
        alert: decision,
        log: logEntry,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      health = {
        ...health,
        lastErrorAt: now(),
        lastError: message.slice(0, 500),
        consecutiveErrors: health.consecutiveErrors + 1,
        lastEvaluatedSymbol: symbol,
        lastDeliveryStatus: 'failed',
      };
      log(`symbol evaluation failed`, { symbol, error: message });

      if (cfg.sendHealthAlerts && hasTelegramCredentials(cfg)) {
        const healthDecision = decideHealthAlert(
          `python_error_${symbol}`,
          cfg,
          health.healthAlertsThisHour,
          now()
        );
        health = { ...health, healthAlertsThisHour: healthDecision.next };
        if (healthDecision.emit) {
          const text = formatHealthAlert({
            symbol,
            reason: message,
            consecutiveErrors: health.consecutiveErrors,
            lastSuccessAt: health.lastSuccessAt,
          });
          await send(text, cfg).catch(() => undefined);
        }
      }
    }
  }

  await store.writeState({ health, dedupe });
  return { evaluations, health, dedupe };
}

async function defaultAnalyze(symbol: string): Promise<ActionCallView> {
  const payload = await fetchPythonActionCall(symbol);
  if (payload.signal) return payload.signal;
  throw new Error(payload.error ?? `Python agent returned no signal for ${symbol}`);
}

function buildLogEntry(
  symbol: string,
  cfg: WorkerConfig,
  signal: ActionCallView,
  alerted: boolean,
  alertReason: string,
  ts: number
): WorkerSignalLogEntry {
  return {
    ts,
    symbol,
    timeframe: signal.timeframe || cfg.setupTimeframe,
    action: signal.action,
    marketRegime: signal.marketRegime,
    tradePermission: signal.tradePermission,
    setupType: signal.entryTrigger,
    confidence: signal.confidenceScore,
    grade: signal.grade,
    signalGrade: signal.signalGrade,
    entry: signal.entryZone.min,
    stopLoss: signal.stopLoss,
    tp1: signal.takeProfits.tp1,
    tp2: signal.takeProfits.tp2,
    tp3: signal.takeProfits.tp3,
    riskRewardRatio: signal.riskRewardRatio,
    invalidation: signal.invalidationReason,
    reasons: signal.reasons,
    warnings: signal.warnings,
    dataHealthOk: signal.dataHealth?.ok ?? true,
    alerted,
    alertReason,
    sourceEngine: signal.sourceEngine ?? 'python_action_call',
    pythonStatus: signal.pythonStatus ?? signal.status,
  };
}
