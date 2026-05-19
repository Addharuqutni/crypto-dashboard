import type {
  RankedScreenerResult,
  ScreenerAlertRecord,
  ScreenerAlertSettings,
  ScreenerAlertStatus,
} from './types';
import { gradeMeets } from './config';

/**
 * Screener alert policy — decides which ranked results should fire local
 * dashboard alerts.
 *
 * All alerts are local dashboard events only. There is no external delivery
 * (no Telegram, no webhooks, no push notifications).
 *
 * Rules:
 *   1. Never alert stale or insufficient-data signals.
 *   2. Never alert WAIT unless explicitly enabled.
 *   3. Suppress duplicate symbol/action within cooldown unless material change.
 *   4. Respect maxAlertsPerHour cap (counts only 'triggered' records).
 *   5. Only alert topNOnly results.
 *   6. Never log secrets.
 *
 * Material change detection:
 *   - Grade improves (e.g. B → A)
 *   - Confidence increases by >= 10
 *   - Entry changes by >= 1%
 *   - Stop loss changes by >= 1%
 *   - Action flips direction (naturally handled by symbol/action key in
 *     cooldown lookup — a flip means no prior 'triggered' record exists
 *     for the new action, so cooldown does not apply)
 */

export interface AlertPolicyDecision {
  symbol: string;
  shouldAlert: boolean;
  reason: string;
  /** The record to persist. Status is final — no post-delivery mutation. */
  record: ScreenerAlertRecord;
}

export interface AlertPolicyContext {
  settings: ScreenerAlertSettings;
  recentAlerts: ScreenerAlertRecord[];
  now: number;
}

/**
 * Evaluate alert eligibility for a batch of ranked results.
 * Returns decisions for every eligible result (up to topNOnly).
 *
 * When alerts are disabled, returns an empty array — no records are
 * persisted to avoid spamming history with meaningless skipped entries.
 */
export function evaluateAlertPolicy(
  ranked: RankedScreenerResult[],
  ctx: AlertPolicyContext
): AlertPolicyDecision[] {
  const { settings, recentAlerts, now } = ctx;
  const decisions: AlertPolicyDecision[] = [];

  // When alerts are disabled, produce NO records to avoid history spam.
  if (!settings.enabled) {
    return [];
  }

  // Only consider eligible results, capped by topNOnly.
  const candidates = ranked
    .filter((r) => r.alertEligible)
    .slice(0, settings.topNOnly);

  // Count only 'triggered' alerts in the current hour window for budget.
  const hourAgo = now - 60 * 60 * 1000;
  const triggeredThisHour = recentAlerts.filter(
    (a) => a.createdAt > hourAgo && a.status === 'triggered'
  ).length;
  let alertsBudget = Math.max(0, settings.maxAlertsPerHour - triggeredThisHour);

  for (const result of candidates) {
    const decision = evaluateSingle(result, settings, recentAlerts, now, alertsBudget);
    decisions.push(decision);
    if (decision.shouldAlert) {
      alertsBudget -= 1;
    }
  }

  return decisions;
}

/**
 * Evaluate a single result against the alert policy.
 */
function evaluateSingle(
  result: RankedScreenerResult,
  settings: ScreenerAlertSettings,
  recentAlerts: ScreenerAlertRecord[],
  now: number,
  alertsBudget: number
): AlertPolicyDecision {
  // Gate: WAIT signals.
  if (result.action === 'WAIT') {
    if (!settings.sendWaitAlerts) {
      return makeDecision(result, now, false, 'skipped', 'wait_disabled');
    }
  }

  // Gate: data health.
  if (!result.dataHealth.ok) {
    return makeDecision(result, now, false, 'suppressed_low_quality', 'unhealthy_data');
  }

  // Gate: confidence.
  if (result.confidence < settings.minConfidence) {
    return makeDecision(result, now, false, 'suppressed_low_quality', 'below_min_confidence');
  }

  // Gate: grade.
  if (!gradeMeets(result.grade, settings.minGrade)) {
    return makeDecision(result, now, false, 'suppressed_low_quality', 'below_min_grade');
  }

  // Gate: risk-reward.
  if (result.riskReward != null && result.riskReward < settings.minRiskReward) {
    return makeDecision(result, now, false, 'suppressed_low_quality', 'below_min_rr');
  }

  // Gate: hourly cap (counts only 'triggered' records).
  if (alertsBudget <= 0) {
    return makeDecision(result, now, false, 'suppressed_hourly_cap', 'hourly_cap_reached');
  }

  // Gate: cooldown + material change.
  const cooldownMs = settings.cooldownMinutes * 60 * 1000;
  const lastTriggered = findLastTriggeredAlert(result.symbol, result.action, recentAlerts);

  if (lastTriggered && (now - lastTriggered.createdAt) < cooldownMs) {
    if (!isMaterialChange(result, lastTriggered)) {
      return makeDecision(result, now, false, 'suppressed_cooldown', 'cooldown_active');
    }
  }

  // All gates passed — local dashboard alert event.
  return makeDecision(result, now, true, 'triggered', 'eligible');
}

/** Build a decision with the corresponding record. */
function makeDecision(
  result: RankedScreenerResult,
  now: number,
  shouldAlert: boolean,
  status: ScreenerAlertStatus,
  reason: string
): AlertPolicyDecision {
  return {
    symbol: result.symbol,
    shouldAlert,
    reason,
    record: makeRecord(result, now, status, reason),
  };
}

/** Construct a ScreenerAlertRecord from a ranked result. */
function makeRecord(
  result: RankedScreenerResult,
  now: number,
  status: ScreenerAlertStatus,
  reason: string
): ScreenerAlertRecord {
  return {
    symbol: result.symbol,
    action: result.action,
    rankingScore: result.rankingScore,
    confidence: result.confidence,
    grade: result.grade,
    entry: result.entry,
    stopLoss: result.stopLoss,
    status,
    reason,
    createdAt: now,
  };
}

/**
 * Find the most recent 'triggered' alert for the same symbol/action so
 * cooldown checks ignore prior skipped/suppressed entries.
 */
function findLastTriggeredAlert(
  symbol: string,
  action: string,
  recentAlerts: ScreenerAlertRecord[]
): ScreenerAlertRecord | null {
  for (let i = recentAlerts.length - 1; i >= 0; i--) {
    const alert = recentAlerts[i];
    if (
      alert &&
      alert.symbol === symbol &&
      alert.action === action &&
      alert.status === 'triggered'
    ) {
      return alert;
    }
  }
  return null;
}

/**
 * Detect material change that justifies overriding cooldown.
 *
 * Material changes:
 *   - Grade improves (e.g. B → A)
 *   - Confidence increases by >= 10
 *   - Entry changes by >= 1%
 *   - Stop loss changes by >= 1%
 *   - Action flip is naturally handled by symbol/action key — a flip means
 *     no prior 'triggered' record exists for the new action direction, so
 *     cooldown does not apply. Documented here for completeness.
 */
function isMaterialChange(
  current: RankedScreenerResult,
  lastAlert: ScreenerAlertRecord
): boolean {
  // Grade improvement.
  if (gradeMeets(current.grade, lastAlert.grade) && current.grade !== lastAlert.grade) {
    return true;
  }

  // Confidence jump >= 10.
  if (current.confidence - lastAlert.confidence >= 10) {
    return true;
  }

  // Entry changes by >= 1%.
  if (
    current.entry != null &&
    lastAlert.entry != null &&
    lastAlert.entry !== 0 &&
    Math.abs(current.entry - lastAlert.entry) / Math.abs(lastAlert.entry) >= 0.01
  ) {
    return true;
  }

  // Stop loss changes by >= 1%.
  if (
    current.stopLoss != null &&
    lastAlert.stopLoss != null &&
    lastAlert.stopLoss !== 0 &&
    Math.abs(current.stopLoss - lastAlert.stopLoss) / Math.abs(lastAlert.stopLoss) >= 0.01
  ) {
    return true;
  }

  return false;
}
