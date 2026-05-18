import type {
  RankedScreenerResult,
  ScreenerAlertRecord,
  ScreenerAlertSettings,
} from './types';
import { gradeMeets } from './config';

/**
 * Screener alert policy — decides which ranked results should fire alerts.
 *
 * Rules:
 *   1. Never alert stale or insufficient-data signals.
 *   2. Never alert WAIT unless explicitly enabled.
 *   3. Suppress duplicate symbol/action within cooldown unless material change.
 *   4. Respect maxAlertsPerHour cap.
 *   5. Only alert topNOnly results.
 *   6. If Telegram is disabled, record delivery status without crashing.
 *   7. Never log secrets.
 *
 * Material change detection:
 *   - Grade improves (e.g. B → A)
 *   - Confidence increases by >= 10
 *   - Entry/SL changes materially (>= 1% shift)
 *   - Action flips direction
 */

export interface AlertPolicyDecision {
  symbol: string;
  shouldAlert: boolean;
  reason: string;
  /**
   * The skeleton record that should be persisted regardless of
   * shouldAlert. Caller fills in the final `status` after delivery.
   */
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
 */
export function evaluateAlertPolicy(
  ranked: RankedScreenerResult[],
  ctx: AlertPolicyContext
): AlertPolicyDecision[] {
  const { settings, recentAlerts, now } = ctx;
  const decisions: AlertPolicyDecision[] = [];

  if (!settings.enabled) {
    return ranked
      .filter((r) => r.alertEligible)
      .slice(0, settings.topNOnly)
      .map((r) => ({
        symbol: r.symbol,
        shouldAlert: false,
        reason: 'alerts_disabled',
        record: makeRecord(r, now, 'skipped', 'alerts_disabled'),
      }));
  }

  // Only consider eligible results, capped by topNOnly.
  const candidates = ranked
    .filter((r) => r.alertEligible)
    .slice(0, settings.topNOnly);

  // Count alerts sent in the current hour window.
  const hourAgo = now - 60 * 60 * 1000;
  const alertsThisHour = recentAlerts.filter((a) => a.createdAt > hourAgo).length;
  let alertsBudget = Math.max(0, settings.maxAlertsPerHour - alertsThisHour);

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
  const symbol = result.symbol;

  // Gate: WAIT signals.
  if (result.action === 'WAIT') {
    if (!settings.sendWaitAlerts) {
      return skip(result, now, 'wait_disabled');
    }
  }

  // Gate: data health.
  if (!result.dataHealth.ok) {
    return skip(result, now, 'unhealthy_data');
  }

  // Gate: confidence.
  if (result.confidence < settings.minConfidence) {
    return skip(result, now, 'below_min_confidence');
  }

  // Gate: grade.
  if (!gradeMeets(result.grade, settings.minGrade)) {
    return skip(result, now, 'below_min_grade');
  }

  // Gate: risk-reward.
  if (result.riskReward != null && result.riskReward < settings.minRiskReward) {
    return skip(result, now, 'below_min_rr');
  }

  // Gate: hourly cap.
  if (alertsBudget <= 0) {
    return skip(result, now, 'hourly_cap_reached');
  }

  // Gate: cooldown + material change.
  const cooldownMs = settings.cooldownMinutes * 60 * 1000;
  const lastAlert = findLastSentAlert(symbol, result.action, recentAlerts);

  if (lastAlert && (now - lastAlert.createdAt) < cooldownMs) {
    if (!isMaterialChange(result, lastAlert)) {
      return skip(result, now, 'cooldown_active');
    }
  }

  // All gates passed — produce eligible record (status finalised on delivery).
  return {
    symbol,
    shouldAlert: true,
    reason: 'eligible',
    record: makeRecord(result, now, 'sent', 'eligible'),
  };
}

/** Build the skip-style decision and accompanying record. */
function skip(
  result: RankedScreenerResult,
  now: number,
  reason: string
): AlertPolicyDecision {
  return {
    symbol: result.symbol,
    shouldAlert: false,
    reason,
    record: makeRecord(result, now, 'skipped', reason),
  };
}

/** Construct a ScreenerAlertRecord from a ranked result. */
function makeRecord(
  result: RankedScreenerResult,
  now: number,
  status: ScreenerAlertRecord['status'],
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
 * Find the most recent `sent` alert for the same symbol/action so cooldown
 * checks ignore prior skipped/failed entries.
 */
function findLastSentAlert(
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
      alert.status === 'sent'
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
 *   - Grade improves
 *   - Confidence increases by >= 10
 *   - Action flipped (already handled by different key)
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

  return false;
}
