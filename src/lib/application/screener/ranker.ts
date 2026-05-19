import type { FuturesGrade } from '@/types/futures-signal';
import type {
  RankedScreenerResult,
  ScreenerAlertSettings,
  ScreenerResult,
} from './types';
import { gradeMeets } from './config';

/**
 * Deterministic ranking engine for screener results.
 *
 * The ranker is:
 *   - Risk-first: only LONG/SHORT with adequate data health, confidence,
 *     grade, and risk-reward pass the eligibility filter.
 *   - Stable: identical inputs always produce identical output order.
 *   - Penalty-aware: stale data, extreme funding, OI conflict, and weak
 *     alignment reduce the ranking score.
 *
 * WAIT is valid analysis — it appears in the output as rank=0, alertEligible=false.
 */

// ────────────────────────────────────────────────────────────
// Scoring weights — must sum to 1.0.
// ────────────────────────────────────────────────────────────
const W_CONFIDENCE = 0.35;
const W_GRADE = 0.20;
const W_RISK_REWARD = 0.20;
const W_MTF_ALIGNMENT = 0.15;
const W_FRESHNESS = 0.10;

// ────────────────────────────────────────────────────────────
// Grade scoring (higher = better).
// ────────────────────────────────────────────────────────────
const GRADE_SCORES: Record<FuturesGrade, number> = {
  A: 100,
  B: 75,
  C: 50,
  D: 25,
};

// ────────────────────────────────────────────────────────────
// Penalty constants.
// ────────────────────────────────────────────────────────────
const PENALTY_STALE_DATA = 15;
const PENALTY_INSUFFICIENT_DATA = 20;
const PENALTY_EXTREME_FUNDING = 10;
const PENALTY_OI_CONFLICT = 8;
const PENALTY_LATE_ENTRY = 12;
const PENALTY_OVEREXTENSION = 10;
const PENALTY_WEAK_SETUP = 5;
const FUNDING_EXTREME_THRESHOLD = 0.001; // ±0.1%

/**
 * Rank and filter screener results. Returns all results (including WAIT)
 * with ranking metadata attached. Eligible results are ranked 1..N;
 * ineligible results have rank=0.
 */
export function rankScreenerResults(
  results: ScreenerResult[],
  settings: ScreenerAlertSettings
): RankedScreenerResult[] {
  // Score every result (even WAITs, for observability).
  const scored = results.map((r) => scoreResult(r, settings));

  // Separate eligible from ineligible.
  const eligible = scored.filter((r) => r.alertEligible);
  const ineligible = scored.filter((r) => !r.alertEligible);

  // Sort eligible descending by rankingScore, break ties by confidence → marketCapRank.
  eligible.sort((a, b) => {
    if (b.rankingScore !== a.rankingScore) return b.rankingScore - a.rankingScore;
    if (b.confidence !== a.confidence) return b.confidence - a.confidence;
    return (a.marketCapRank ?? 999) - (b.marketCapRank ?? 999);
  });

  // Assign ranks to eligible results.
  for (const [i, item] of eligible.entries()) {
    item.rank = i + 1;
  }

  // Ineligible results get rank 0.
  for (const r of ineligible) {
    r.rank = 0;
  }

  // Return eligible first (ranked), then ineligible (original order).
  return [...eligible, ...ineligible];
}

/**
 * Score a single result and determine alert eligibility.
 * Pure function — no side effects, fully deterministic.
 */
function scoreResult(
  result: ScreenerResult,
  settings: ScreenerAlertSettings
): RankedScreenerResult {
  const blockReasons: string[] = [];

  // ── Eligibility gates ──
  if (result.action === 'WAIT') {
    blockReasons.push('Action is WAIT');
  }
  if (result.confidence < settings.minConfidence) {
    blockReasons.push(`Confidence ${result.confidence} < min ${settings.minConfidence}`);
  }
  if (!gradeMeets(result.grade, settings.minGrade)) {
    blockReasons.push(`Grade ${result.grade} below min ${settings.minGrade}`);
  }
  if (!result.dataHealth.ok) {
    blockReasons.push('Data health is not OK');
  }
  if (result.riskReward != null && result.riskReward < settings.minRiskReward) {
    blockReasons.push(`R:R ${result.riskReward.toFixed(2)} < min ${settings.minRiskReward}`);
  }
  // Trade permission conflict applies only to LONG/SHORT.
  // WAIT + no_trade is normal and must not generate conflict wording.
  if (result.action !== 'WAIT') {
    if (
      result.tradePermission === 'no_trade' ||
      (result.action === 'LONG' && result.tradePermission === 'short_only') ||
      (result.action === 'SHORT' && result.tradePermission === 'long_only')
    ) {
      blockReasons.push(`Trade permission ${result.tradePermission} conflicts with ${result.action}`);
    }
  }

  const alertEligible = blockReasons.length === 0;

  // ── Composite score ──
  const confidenceScore = clamp(result.confidence, 0, 100);
  const gradeScore = GRADE_SCORES[result.grade] ?? 25;
  const riskRewardScore = computeRiskRewardScore(result.riskReward);
  const mtfScore = clamp(result.mtfAlignmentScore ?? 50, 0, 100);
  const freshnessScore = computeFreshnessScore(result);

  const rawScore =
    confidenceScore * W_CONFIDENCE +
    gradeScore * W_GRADE +
    riskRewardScore * W_RISK_REWARD +
    mtfScore * W_MTF_ALIGNMENT +
    freshnessScore * W_FRESHNESS;

  // ── Penalties ──
  const { totalPenalty, reasons: penaltyReasons } = computePenalties(result);

  const rankingScore = Math.max(0, Math.round((rawScore - totalPenalty) * 100) / 100);

  // ── Rank reasons ──
  const rankReason: string[] = [];
  if (alertEligible) {
    rankReason.push(`Score: ${rankingScore.toFixed(1)} (conf=${confidenceScore}, grade=${gradeScore}, rr=${riskRewardScore.toFixed(0)}, mtf=${mtfScore.toFixed(0)}, fresh=${freshnessScore.toFixed(0)})`);
    if (penaltyReasons.length > 0) {
      rankReason.push(`Penalties: ${penaltyReasons.join(', ')}`);
    }
  } else {
    rankReason.push('Ineligible');
  }

  return {
    ...result,
    rank: 0, // assigned by caller after sorting
    rankingScore,
    rankReason,
    alertEligible,
    alertBlockReasons: blockReasons,
  };
}

/**
 * Map risk-reward ratio to 0..100 score.
 * 0 when null/unavailable, linear 0→100 for 0→4+.
 */
function computeRiskRewardScore(rr: number | null): number {
  if (rr == null || rr <= 0) return 0;
  return clamp((rr / 4) * 100, 0, 100);
}

/**
 * Freshness score based on data health.
 * 100 when all timeframes are fresh, decreasing with staleness.
 */
function computeFreshnessScore(result: ScreenerResult): number {
  if (!result.dataHealth.ok) return 20;
  const setupOk = result.dataHealth.setup.ok;
  const macroOk = result.dataHealth.macro.ok;
  const triggerOk = result.dataHealth.trigger.ok;
  const freshCount = [setupOk, macroOk, triggerOk].filter(Boolean).length;
  // Base score from timeframe freshness.
  return Math.round((freshCount / 3) * 100);
}

/**
 * Compute risk-first penalties from available evidence.
 * Returns total penalty and human-readable reasons.
 */
function computePenalties(result: ScreenerResult): { totalPenalty: number; reasons: string[] } {
  let total = 0;
  const reasons: string[] = [];

  // Stale data penalty.
  if (!result.dataHealth.ok) {
    total += PENALTY_STALE_DATA;
    reasons.push(`stale_data(-${PENALTY_STALE_DATA})`);
  }

  // Insufficient data (setup or trigger).
  if (!result.dataHealth.setup.ok || !result.dataHealth.trigger.ok) {
    total += PENALTY_INSUFFICIENT_DATA;
    reasons.push(`insufficient_data(-${PENALTY_INSUFFICIENT_DATA})`);
  }

  // Extreme funding rate.
  if (result.fundingRate != null && Math.abs(result.fundingRate) >= FUNDING_EXTREME_THRESHOLD) {
    total += PENALTY_EXTREME_FUNDING;
    reasons.push(`extreme_funding(-${PENALTY_EXTREME_FUNDING})`);
  }

  // OI conflict: check if OI direction conflicts with action direction.
  if (result.action !== 'WAIT' && result.openInterestChangePercent != null) {
    const oiRising = result.openInterestChangePercent > 5;
    const oiFalling = result.openInterestChangePercent < -5;
    if (
      (result.action === 'LONG' && oiFalling) ||
      (result.action === 'SHORT' && oiRising)
    ) {
      total += PENALTY_OI_CONFLICT;
      reasons.push(`oi_conflict(-${PENALTY_OI_CONFLICT})`);
    }
  }

  // Weak setup: low MTF alignment.
  if (result.mtfAlignmentScore != null && result.mtfAlignmentScore < 50) {
    total += PENALTY_WEAK_SETUP;
    reasons.push(`weak_alignment(-${PENALTY_WEAK_SETUP})`);
  }

  // Overextension warning.
  if (result.warnings.some((w) => w.toLowerCase().includes('overextended'))) {
    total += PENALTY_OVEREXTENSION;
    reasons.push(`overextension(-${PENALTY_OVEREXTENSION})`);
  }

  // Late entry warning.
  if (result.warnings.some((w) => w.toLowerCase().includes('late entry'))) {
    total += PENALTY_LATE_ENTRY;
    reasons.push(`late_entry(-${PENALTY_LATE_ENTRY})`);
  }

  return { totalPenalty: total, reasons };
}

/** Clamp a number to [min, max]. */
function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}
