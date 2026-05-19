import type {
  FuturesEntryTrigger,
  FuturesGrade,
  FuturesMarketRegimeId,
  FuturesSignal,
  FuturesSignalAction,
  FuturesSignalGrade,
  FuturesTradePermission,
} from '@/types/futures-signal';
import type { BinanceInterval } from '@/lib/adapters/binance/intervals';

/**
 * Worker public types.
 *
 * The worker is a long-running Node process (or a single-shot run from a cron
 * trigger) that fetches Binance Futures candles, runs the deterministic signal
 * engine, dedupes alerts, persists outcomes, and notifies Telegram. Every
 * data structure here is JSON-serialisable so the JSONL/state store works
 * without custom encoders.
 */

/**
 * Backwards-compat alias for the canonical `BinanceInterval`.
 *
 * @deprecated Import `BinanceInterval` from `@/lib/adapters/binance` instead.
 * Kept here so callers using `WorkerInterval` keep working during the
 * transition.
 */
export type WorkerInterval = BinanceInterval;

/** Per-symbol cycle configuration. The worker runs every `intervalMinutes`. */
export interface WorkerConfig {
  /** Symbols to monitor. Defaults to ['BTCUSDT']. */
  symbols: string[];
  /** Setup timeframe used to drive the engine. */
  setupTimeframe: BinanceInterval;
  /** Macro / trigger TFs used to populate the engine inputs. */
  macroTimeframe: BinanceInterval;
  triggerTimeframe: BinanceInterval;
  /** Cycle interval in minutes. Default 15. */
  intervalMinutes: number;
  /** Cooldown per (symbol, action, setup, timeframe). Default 60. */
  alertCooldownMinutes: number;
  /** Minimum confidence needed to emit a directional alert. Default 65. */
  minConfidenceToAlert: number;
  /** When false, WAIT outcomes are recorded but never sent to Telegram. */
  sendWaitAlerts: boolean;
  /** When true, persistent data-health failures emit a rate-limited warning. */
  sendHealthAlerts: boolean;
  /** Cap on health alerts (per kind) per hour. Defaults to 1. */
  healthAlertsPerHour: number;
  /** Directory where JSONL signal log + state.json live. */
  dataDir: string;
  /** Telegram credentials. Stored only in memory after env load. */
  telegram: {
    botToken: string | null;
    chatId: string | null;
  };
  /**
   * When true, the worker continues running after Telegram errors instead of
   * crashing. Default true. The error is logged and reflected in health.
   */
  continueOnTelegramFailure: boolean;
}

/** Alert lifecycle states tracked in the dedupe store. */
export interface AlertDedupeRecord {
  key: string;
  lastSentAt: number;
  lastAction: FuturesSignalAction;
  lastConfidence: number;
  lastGrade: FuturesSignalGrade;
  lastEntry: number | null;
  lastStopLoss: number | null;
}

export type AlertDedupeState = Record<string, AlertDedupeRecord>;

/** Health snapshot persisted between runs so the worker is observable. */
export interface WorkerHealth {
  lastRunAt: number | null;
  lastSuccessAt: number | null;
  lastErrorAt: number | null;
  consecutiveErrors: number;
  /** Last symbol that was evaluated (success or failure). */
  lastEvaluatedSymbol: string | null;
  /** Last engine action emitted by the worker. Null when no run has occurred. */
  lastSignalAction: FuturesSignalAction | null;
  /** Outcome of the most recent Telegram delivery attempt. */
  lastDeliveryStatus: 'sent' | 'skipped' | 'failed' | 'disabled' | null;
  /** Per-kind health-alert counters; the dedupe layer enforces hourly caps. */
  healthAlertsThisHour: Record<string, { count: number; windowStartedAt: number }>;
  /** Last error message (truncated) — for Telegram-facing debugging only. */
  lastError: string | null;
}

/**
 * Single-line entry written to the worker's JSONL signal log. Designed to be
 * stable and grep-friendly; UI/journal can rehydrate from it later.
 */
export interface WorkerSignalLogEntry {
  ts: number;
  symbol: string;
  timeframe: string;
  action: FuturesSignalAction;
  marketRegime: FuturesMarketRegimeId;
  tradePermission: FuturesTradePermission;
  setupType: FuturesEntryTrigger;
  confidence: number;
  grade: FuturesGrade;
  signalGrade: FuturesSignalGrade;
  entry: number | null;
  stopLoss: number | null;
  tp1: number | null;
  tp2: number | null;
  tp3: number | null;
  riskRewardRatio: number | null;
  invalidation: string | null;
  reasons: string[];
  warnings: string[];
  dataHealthOk: boolean;
  /** True iff Telegram was actually invoked for this entry. */
  alerted: boolean;
  alertReason?: string;
}

/** Output of one evaluator cycle for a single symbol. */
export interface EvaluationResult {
  symbol: string;
  signal: FuturesSignal;
  /** Decision produced by the dedupe layer. */
  alert: AlertDecision;
  /** Raw log entry that should be appended to the JSONL store. */
  log: WorkerSignalLogEntry;
}

export type AlertDecisionReason =
  | 'cooldown'
  | 'no_change'
  | 'wait_disabled'
  | 'below_min_confidence'
  | 'health_warning_rate_limited'
  | 'data_health_ok'
  | 'first_emit'
  | 'state_changed'
  | 'health_warning_emit'
  | 'wait_emit';

export interface AlertDecision {
  emit: boolean;
  reason: AlertDecisionReason;
  /** Stable de-dupe key used for the cooldown registry. */
  key: string;
  /** Optional user-readable explanation surfaced in the JSONL log. */
  detail?: string;
}
