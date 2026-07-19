import type { ActionCallView } from '@/types/action-call';
import type { AlertDecision, AlertDedupeRecord, AlertDedupeState, WorkerConfig } from './types';

/**
 * Alert deduper for Python Action Call alerts.
 *
 * Rules:
 *  - WAIT is suppressed unless `sendWaitAlerts` is true.
 *  - Directional alerts require `status === 'READY'` and min confidence.
 *  - Within cooldown, only material changes re-emit.
 */
const MATERIAL_PRICE_DIFF_PCT = 0.5;

export function decide(
  symbol: string,
  signal: ActionCallView,
  cfg: WorkerConfig,
  state: AlertDedupeState,
  nowMs: number = Date.now()
): AlertDecision {
  const key = makeKey(symbol, signal);

  if (signal.action === 'WAIT') {
    if (!cfg.sendWaitAlerts) {
      return { emit: false, reason: 'wait_disabled', key };
    }
    return decideWithCooldown(state, key, signal, cfg, nowMs, 'wait_emit');
  }

  if (signal.confidenceScore < cfg.minConfidenceToAlert) {
    return {
      emit: false,
      reason: 'below_min_confidence',
      key,
      detail: `confidence ${signal.confidenceScore} < ${cfg.minConfidenceToAlert}`,
    };
  }

  // Only READY calls are alertable by default.
  if (signal.status !== 'READY') {
    return { emit: false, reason: 'wait_confirmation', key };
  }

  return decideWithCooldown(state, key, signal, cfg, nowMs, 'state_changed');
}

function decideWithCooldown(
  state: AlertDedupeState,
  key: string,
  signal: ActionCallView,
  cfg: WorkerConfig,
  nowMs: number,
  materialReason: 'state_changed' | 'wait_emit'
): AlertDecision {
  const prev = state[key];
  if (!prev) {
    return { emit: true, reason: 'first_emit', key };
  }

  const cooldownMs = cfg.alertCooldownMinutes * 60_000;
  const elapsed = nowMs - prev.lastSentAt;

  if (elapsed >= cooldownMs) {
    return { emit: true, reason: materialReason, key };
  }

  if (hasMaterialChange(prev, signal)) {
    return {
      emit: true,
      reason: materialReason,
      key,
      detail: 'material change inside cooldown',
    };
  }
  return { emit: false, reason: 'no_change', key };
}

function hasMaterialChange(prev: AlertDedupeRecord, sig: ActionCallView): boolean {
  if (gradeRank(sig.signalGrade) > gradeRank(prev.lastGrade)) return true;
  if (Math.abs(sig.confidenceScore - prev.lastConfidence) >= 10) return true;

  const newEntry = sig.entryZone.min;
  const newStop = sig.stopLoss;
  if (priceMovedSignificantly(prev.lastEntry, newEntry)) return true;
  if (priceMovedSignificantly(prev.lastStopLoss, newStop)) return true;

  return false;
}

function priceMovedSignificantly(prev: number | null, next: number | null): boolean {
  if (prev == null || next == null || prev <= 0 || next <= 0) return false;
  const diffPct = Math.abs((next - prev) / prev) * 100;
  return diffPct >= MATERIAL_PRICE_DIFF_PCT;
}

function gradeRank(g: AlertDedupeRecord['lastGrade']): number {
  switch (g) {
    case 'A+':
      return 5;
    case 'A':
      return 4;
    case 'B':
      return 3;
    case 'C':
      return 2;
    case 'D':
      return 1;
    default:
      return 0;
  }
}

export function makeRecord(
  symbol: string,
  signal: ActionCallView,
  nowMs: number
): AlertDedupeRecord {
  return {
    key: makeKey(symbol, signal),
    lastSentAt: nowMs,
    lastAction: signal.action,
    lastConfidence: signal.confidenceScore,
    lastGrade: signal.signalGrade,
    lastEntry: signal.entryZone.min,
    lastStopLoss: signal.stopLoss,
  };
}

function makeKey(symbol: string, signal: ActionCallView): string {
  return [symbol, signal.action, signal.signal, signal.status].join(':');
}

/**
 * Rate-limit health warnings per kind (e.g. python_unreachable, data_stale).
 * Returns whether a new health alert may be emitted and the updated counters.
 */
export function decideHealthAlert(
  kind: string,
  cfg: WorkerConfig,
  current: Record<string, { count: number; windowStartedAt: number }>,
  nowMs: number = Date.now()
): {
  emit: boolean;
  reason: 'health_warning_emit' | 'health_warning_rate_limited';
  next: Record<string, { count: number; windowStartedAt: number }>;
} {
  const windowMs = 60 * 60 * 1000;
  const maxPerHour = Math.max(0, cfg.healthAlertsPerHour);
  const prev = current[kind];
  const next = { ...current };

  if (maxPerHour <= 0) {
    return { emit: false, reason: 'health_warning_rate_limited', next };
  }

  if (!prev || nowMs - prev.windowStartedAt >= windowMs) {
    next[kind] = { count: 1, windowStartedAt: nowMs };
    return { emit: true, reason: 'health_warning_emit', next };
  }

  if (prev.count >= maxPerHour) {
    return { emit: false, reason: 'health_warning_rate_limited', next };
  }

  next[kind] = { count: prev.count + 1, windowStartedAt: prev.windowStartedAt };
  return { emit: true, reason: 'health_warning_emit', next };
}
