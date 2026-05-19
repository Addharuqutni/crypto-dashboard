import type { WorkerConfig } from './types';
import { BINANCE_INTERVALS, type BinanceInterval } from '@/lib/adapters/binance/intervals';

/**
 * Default worker configuration. Tuned for the Phase 3 spec: monitor BTCUSDT
 * on a 15m cycle using 30m setup + 4H macro + 15m trigger candles.
 *
 * Secrets (`telegram.botToken`, `telegram.chatId`) are pulled from env at
 * load time only. They are never embedded in defaults and never logged.
 */

export const DEFAULT_WORKER_CONFIG: WorkerConfig = {
  symbols: ['BTCUSDT'],
  setupTimeframe: '30m',
  macroTimeframe: '4h',
  triggerTimeframe: '15m',
  intervalMinutes: 15,
  alertCooldownMinutes: 60,
  minConfidenceToAlert: 65,
  sendWaitAlerts: false,
  sendHealthAlerts: true,
  healthAlertsPerHour: 1,
  dataDir: './data/worker',
  telegram: {
    botToken: null,
    chatId: null,
  },
  continueOnTelegramFailure: true,
};

const VALID_INTERVALS = BINANCE_INTERVALS;

/**
 * Build a worker config from environment variables and optional overrides.
 *
 * Priority order (highest first):
 *   1. Explicit `overrides` argument (used by tests + CLI flags).
 *   2. `process.env` values.
 *   3. Defaults from `DEFAULT_WORKER_CONFIG`.
 *
 * The function is pure when `env` and `overrides` are supplied — making it
 * trivially testable without polluting the real `process.env`.
 */
export function loadWorkerConfig(
  env: Record<string, string | undefined> = process.env,
  overrides: Partial<WorkerConfig> = {}
): WorkerConfig {
  const cfg: WorkerConfig = {
    ...DEFAULT_WORKER_CONFIG,
    telegram: { ...DEFAULT_WORKER_CONFIG.telegram },
  };

  // --- symbols ---
  if (env.WORKER_SYMBOLS) {
    cfg.symbols = parseSymbols(env.WORKER_SYMBOLS);
  }

  // --- timeframes ---
  cfg.setupTimeframe = parseInterval(env.WORKER_SETUP_TF, cfg.setupTimeframe);
  cfg.macroTimeframe = parseInterval(env.WORKER_MACRO_TF, cfg.macroTimeframe);
  cfg.triggerTimeframe = parseInterval(env.WORKER_TRIGGER_TF, cfg.triggerTimeframe);

  // --- numbers ---
  cfg.intervalMinutes = clampPosInt(env.WORKER_INTERVAL_MIN, cfg.intervalMinutes, 1, 24 * 60);
  cfg.alertCooldownMinutes = clampPosInt(
    env.WORKER_ALERT_COOLDOWN_MIN,
    cfg.alertCooldownMinutes,
    0,
    24 * 60
  );
  cfg.minConfidenceToAlert = clampPosInt(
    env.WORKER_MIN_CONFIDENCE,
    cfg.minConfidenceToAlert,
    0,
    100
  );
  cfg.healthAlertsPerHour = clampPosInt(
    env.WORKER_HEALTH_ALERTS_PER_HOUR,
    cfg.healthAlertsPerHour,
    0,
    20
  );

  // --- booleans ---
  cfg.sendWaitAlerts = parseBool(env.WORKER_SEND_WAIT_ALERTS, cfg.sendWaitAlerts);
  cfg.sendHealthAlerts = parseBool(env.WORKER_SEND_HEALTH_ALERTS, cfg.sendHealthAlerts);
  cfg.continueOnTelegramFailure = parseBool(
    env.WORKER_CONTINUE_ON_TELEGRAM_FAILURE,
    cfg.continueOnTelegramFailure
  );

  // --- paths ---
  if (env.WORKER_DATA_DIR && env.WORKER_DATA_DIR.trim()) {
    cfg.dataDir = env.WORKER_DATA_DIR.trim();
  }

  // --- secrets ---
  cfg.telegram.botToken = env.TELEGRAM_BOT_TOKEN?.trim() || null;
  cfg.telegram.chatId = env.TELEGRAM_CHAT_ID?.trim() || null;

  // --- explicit overrides take priority for everything ---
  return mergeOverrides(cfg, overrides);
}

/**
 * Validate config invariants. Returns an array of human-readable problems.
 * Empty array means the config is usable.
 */
export function validateWorkerConfig(cfg: WorkerConfig): string[] {
  const problems: string[] = [];
  if (cfg.symbols.length === 0) problems.push('symbols: at least one symbol is required.');
  for (const sym of cfg.symbols) {
    if (!/^[A-Z0-9]{3,20}$/.test(sym)) {
      problems.push(`symbols: "${sym}" is not a valid Binance perpetual symbol.`);
    }
  }
  if (cfg.intervalMinutes < 1) {
    problems.push('intervalMinutes: must be >= 1.');
  }
  if (cfg.alertCooldownMinutes < 0) {
    problems.push('alertCooldownMinutes: must be >= 0.');
  }
  if (cfg.sendHealthAlerts && cfg.healthAlertsPerHour < 1) {
    problems.push('healthAlertsPerHour: must be >= 1 when sendHealthAlerts is true.');
  }
  return problems;
}

/**
 * Returns true iff Telegram credentials are present. The worker still runs
 * without them — alerts are just skipped with `lastDeliveryStatus: 'disabled'`.
 */
export function hasTelegramCredentials(cfg: WorkerConfig): boolean {
  return !!cfg.telegram.botToken && !!cfg.telegram.chatId;
}

/** Defensive parse for comma-separated symbol lists. */
function parseSymbols(raw: string): string[] {
  return raw
    .split(',')
    .map((s) => s.trim().toUpperCase())
    .filter((s) => s.length > 0);
}

function parseInterval(raw: string | undefined, fallback: BinanceInterval): BinanceInterval {
  if (!raw) return fallback;
  const cleaned = raw.trim().toLowerCase() as BinanceInterval;
  return VALID_INTERVALS.includes(cleaned) ? cleaned : fallback;
}

function clampPosInt(
  raw: string | undefined,
  fallback: number,
  min: number,
  max: number
): number {
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n)) return fallback;
  if (n < min) return min;
  if (n > max) return max;
  return n;
}

function parseBool(raw: string | undefined, fallback: boolean): boolean {
  if (!raw) return fallback;
  const v = raw.trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(v)) return true;
  if (['0', 'false', 'no', 'off'].includes(v)) return false;
  return fallback;
}

function mergeOverrides(base: WorkerConfig, overrides: Partial<WorkerConfig>): WorkerConfig {
  return {
    ...base,
    ...overrides,
    telegram: {
      ...base.telegram,
      ...(overrides.telegram ?? {}),
    },
  };
}
