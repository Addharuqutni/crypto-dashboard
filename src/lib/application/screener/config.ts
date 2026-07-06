import type { ScreenerAlertSettings, ScreenerConfig } from './types';
import { getScreenerUniverseFromEnv } from './universe';

/**
 * Default ranking/alert thresholds for the screener.
 * These are intentionally conservative: ranking is risk-first, so the
 * defaults reject low-confidence or low-RR setups outright.
 */
export const DEFAULT_SCREENER_ALERT_SETTINGS: ScreenerAlertSettings = {
  enabled: false,
  minConfidence: 75,
  minGrade: 'B',
  minRiskReward: 1.5,
  maxAlertsPerHour: 10,
  cooldownMinutes: 10,
  sendWaitAlerts: false,
  topNOnly: 5,
};

/**
 * Default screener configuration. Mirrors the worker timeframes so the same
 * deterministic engine evaluates the same data shape — no duplicated trading
 * logic and no AI in the hot path.
 */
export const DEFAULT_SCREENER_CONFIG: ScreenerConfig = {
  // ponytail: env-driven universe so SCREENER_SYMBOLS/SCREENER_MAX_SYMBOLS
  // apply everywhere (scheduler, CLI, cron) — not just the on-demand API route.
  symbols: getScreenerUniverseFromEnv(100),
  setupTimeframe: '30m',
  triggerTimeframe: '15m',
  macroTimeframe: '4h',
  // ponytail: env override keeps the cycle cadence tunable without code edits;
  // clamp [1, 1440] min so a stray value can't starve the event loop or stall.
  intervalMinutes: clampEnvInt('SCREENER_INTERVAL_MINUTES', 5, 1, 1440),
  maxConcurrentSymbols: 3,
  candleLimit: 300,
  alertSettings: DEFAULT_SCREENER_ALERT_SETTINGS,
};

/** Read a positive integer env var with bounds; falls back when unset/invalid. */
function clampEnvInt(name: string, fallback: number, min: number, max: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(n)));
}

/** Numeric ordering for grade thresholds (lower = better). */
const GRADE_ORDER = ['A', 'B', 'C', 'D'] as const;

/** Returns the numeric rank of a coarse grade for threshold comparisons. */
export function gradeRank(grade: 'A' | 'B' | 'C' | 'D'): number {
  return GRADE_ORDER.indexOf(grade);
}

/** Returns true when `grade` meets or exceeds `min`. */
export function gradeMeets(grade: 'A' | 'B' | 'C' | 'D', min: 'A' | 'B' | 'C' | 'D'): boolean {
  return gradeRank(grade) <= gradeRank(min);
}
