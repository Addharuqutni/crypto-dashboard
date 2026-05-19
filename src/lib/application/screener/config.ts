import type { ScreenerAlertSettings, ScreenerConfig } from './types';
import { getDefaultUniverse } from './universe';

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
  symbols: getDefaultUniverse(),
  setupTimeframe: '30m',
  triggerTimeframe: '15m',
  macroTimeframe: '4h',
  intervalMinutes: 5,
  maxConcurrentSymbols: 3,
  candleLimit: 300,
  alertSettings: DEFAULT_SCREENER_ALERT_SETTINGS,
};

/** Numeric ordering for grade thresholds (lower = better). */
export const GRADE_ORDER = ['A', 'B', 'C', 'D'] as const;

/** Returns the numeric rank of a coarse grade for threshold comparisons. */
export function gradeRank(grade: 'A' | 'B' | 'C' | 'D'): number {
  return GRADE_ORDER.indexOf(grade);
}

/** Returns true when `grade` meets or exceeds `min`. */
export function gradeMeets(grade: 'A' | 'B' | 'C' | 'D', min: 'A' | 'B' | 'C' | 'D'): boolean {
  return gradeRank(grade) <= gradeRank(min);
}
