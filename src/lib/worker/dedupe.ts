import type { FuturesSignal } from '@/types/futures-signal';
import type {
  AlertDecision,
  AlertDedupeRecord,
  AlertDedupeState,
  WorkerConfig,
} from './types';

/**
 * Alert deduper.
 *
 * Capital preservation > alert frequency. The deduper enforces:
 *
 *   - Per-(symbol, timeframe, action, setup) cooldown.
 *   - Material-change re-alerting: same key may re-emit before cooldown if
 *     entry/SL move ≥ 0.5% or grade improves.
 *   - WAIT alerts gated by config (`sendWaitAlerts`).
 *   - Confidence floor: directional alerts below `minConfidenceToAlert` are
 *     silenced.
 *   - Health warnings rate-limited per kind, per hour.
 *
 * The functions are pure: `decide()` takes the current state and returns an
 * `AlertDecision`. Callers persist a new dedupe record only when the decision
 * actually emits an alert.
 */

const MATERIAL_PRICE_DIFF_PCT = 0.5;

/**
 * Decide whether the engine output should be sent now.
 *
 * `nowMs` defaults to `Date.now()` but is injected explicitly in tests so the
 * cooldown math is reproducible.
 */
export function decide(
  symbol: string,
  signal: FuturesSignal,
  cfg: WorkerConfig,
  state: AlertDedupeState,
  nowMs: number = Date.now()
): AlertDecision {
  const key = makeKey(symbol, signal);

  // WAIT path. WAITs short-circuit before the confidence floor so an "WAIT
  // because data stale" can still surface as a health alert later if the
  // caller chooses.
  if (signal.action === 'WAIT') {
    if (!cfg.sendWaitAlerts) {
      return { emit: false, reason: 'wait_disabled', key };
    }
    return decideWithCooldown(state, key, signal, cfg, nowMs, 'wait_emit');
  }

  // Directional path. Apply confidence floor first.
  if (signal.confidence < cfg.minConfidenceToAlert) {
    return {
      emit: false,
      reason: 'below_min_confidence',
      key,
      detail: `confidence ${signal.confidence} < ${cfg.minConfidenceToAlert}`,
    };
  }

  return decideWithCooldown(state, key, signal, cfg, nowMs, 'state_changed');
}

/**
 * Apply the cooldown rule, allowing material-change re-emits.
 *
 * `materialReason` is the reason returned for a re-emit caused by changed
 * state. The first emit always returns `first_emit`.
 */
function decideWithCooldown(
  state: AlertDedupeState,
  key: string,
  signal: FuturesSignal,
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

  // Within cooldown — only allow material change.
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

/**
 * Material change rules:
 *   - Grade improved (toward A)
 *   - Confidence jumped ≥10 points
 *   - Entry or SL moved ≥0.5% from the previous record
 *
 * Anything else is treated as the "same" alert and held back.
 */
function hasMaterialChange(prev: AlertDedupeRecord, sig: FuturesSignal): boolean {
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

/** Grade rank: A+ > A > B > C > D. Higher = better. */
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

/**
 * Build a dedupe record snapshot from a fresh signal. Stored in the dedupe
 * map after a successful Telegram send.
 */
export function makeRecord(
  symbol: string,
  signal: FuturesSignal,
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

/**
 * Stable composite key used as the dedupe map's primary key. Including the
 * setup type means a fresh trigger on the same symbol can still emit even
 * during cooldown — that's intentional, those represent genuinely different
 * setups.
 */
export function makeKey(symbol: string, signal: FuturesSignal): string {
  return [symbol, signal.action, signal.entryTrigger ?? 'NO_TRIGGER'].join(':');
}

/**
 * Health-alert rate limiter. Callers track one counter per "kind" (e.g.
 * `data_health_setup_stale`) and a sliding 1-hour window.
 *
 * Returns whether the alert is allowed *and* the new state to persist.
 */
export function decideHealthAlert(
  kind: string,
  cfg: WorkerConfig,
  perKind: Record<string, { count: number; windowStartedAt: number }>,
  nowMs: number = Date.now()
): {
  allow: boolean;
  next: Record<string, { count: number; windowStartedAt: number }>;
} {
  if (!cfg.sendHealthAlerts) {
    return { allow: false, next: perKind };
  }
  const cap = cfg.healthAlertsPerHour;
  const HOUR = 3_600_000;
  const existing = perKind[kind];
  const next = { ...perKind };

  if (!existing || nowMs - existing.windowStartedAt >= HOUR) {
    // New 1-hour window opens with this attempt.
    next[kind] = { count: 1, windowStartedAt: nowMs };
    return { allow: true, next };
  }

  if (existing.count >= cap) {
    return { allow: false, next: perKind };
  }

  next[kind] = { count: existing.count + 1, windowStartedAt: existing.windowStartedAt };
  return { allow: true, next };
}
