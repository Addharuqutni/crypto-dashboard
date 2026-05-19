import type { RankedScreenerResult, AiProposedLevels, AiLevelValidationStatus } from './types';
import type { ScreenerAlertSettings } from './types';

export interface AiLevelValidationResult {
  status: AiLevelValidationStatus;
  reasons: string[];
}

export interface AiLevelValidationOptions {
  /** Maximum entry distance from engine/current reference as percent. */
  maxEntryDistancePercent: number;
  /** Minimum configured risk reward. */
  minRiskReward: number;
}

export const DEFAULT_AI_LEVEL_VALIDATION_OPTIONS: AiLevelValidationOptions = {
  maxEntryDistancePercent: 1,
  minRiskReward: 1.5,
};

/**
 * Build validation options from alert/rank settings so AI proposals cannot
 * loosen deterministic risk requirements.
 */
export function aiValidationOptionsFromSettings(
  settings: ScreenerAlertSettings
): AiLevelValidationOptions {
  return {
    ...DEFAULT_AI_LEVEL_VALIDATION_OPTIONS,
    minRiskReward: settings.minRiskReward,
  };
}

/**
 * Validate AI-proposed levels against deterministic safety rules.
 * AI proposals are never usable unless this returns VALIDATED.
 */
export function validateAiProposedLevels(
  result: RankedScreenerResult,
  proposal: AiProposedLevels | null | undefined,
  options: AiLevelValidationOptions = DEFAULT_AI_LEVEL_VALIDATION_OPTIONS
): AiLevelValidationResult {
  if (!proposal) {
    return { status: 'NOT_PROVIDED', reasons: [] };
  }

  const reasons: string[] = [];

  if (!result.dataHealth.ok) reasons.push('data_health_not_ok');
  if (result.action === 'WAIT') reasons.push('engine_action_wait');
  if (result.action !== 'LONG' && result.action !== 'SHORT') reasons.push('unsupported_engine_action');

  const entry = proposal.entry;
  const stopLoss = proposal.stopLoss;
  const takeProfits = proposal.takeProfits.filter((tp) => Number.isFinite(tp));

  if (!Number.isFinite(entry) || entry == null || entry <= 0) reasons.push('entry_missing_or_invalid');
  if (!Number.isFinite(stopLoss) || stopLoss == null || stopLoss <= 0) reasons.push('stop_loss_missing_or_invalid');
  if (takeProfits.length === 0) reasons.push('take_profit_missing_or_invalid');
  if (!Array.isArray(proposal.basis) || proposal.basis.length === 0) reasons.push('basis_missing');

  if (entry != null && result.entry != null && result.entry > 0) {
    const distancePct = Math.abs(entry - result.entry) / result.entry * 100;
    if (distancePct > options.maxEntryDistancePercent) reasons.push('entry_too_far_from_engine_reference');
  }

  if (entry != null && stopLoss != null) {
    if (result.action === 'LONG' && stopLoss >= entry) reasons.push('stop_loss_wrong_side_for_long');
    if (result.action === 'SHORT' && stopLoss <= entry) reasons.push('stop_loss_wrong_side_for_short');
  }

  for (const tp of takeProfits) {
    if (entry == null) break;
    if (result.action === 'LONG' && tp <= entry) reasons.push('take_profit_wrong_side_for_long');
    if (result.action === 'SHORT' && tp >= entry) reasons.push('take_profit_wrong_side_for_short');
  }

  const rr = computeBestRiskReward(result.action, entry, stopLoss, takeProfits);
  if (rr == null || rr < options.minRiskReward) reasons.push('risk_reward_below_minimum');

  return reasons.length === 0
    ? { status: 'VALIDATED', reasons: [] }
    : { status: 'REJECTED', reasons: [...new Set(reasons)] };
}

/**
 * Compute best available R:R from proposed levels. Uses the farthest valid TP
 * so multi-target proposals can pass only when at least one target satisfies
 * the deterministic minimum.
 */
function computeBestRiskReward(
  action: string,
  entry: number | null,
  stopLoss: number | null,
  takeProfits: number[]
): number | null {
  if (entry == null || stopLoss == null || entry <= 0 || stopLoss <= 0) return null;
  const risk = Math.abs(entry - stopLoss);
  if (risk <= 0) return null;

  const rewards = takeProfits
    .map((tp) => {
      if (action === 'LONG') return tp - entry;
      if (action === 'SHORT') return entry - tp;
      return 0;
    })
    .filter((reward) => reward > 0);

  if (rewards.length === 0) return null;
  return Math.max(...rewards) / risk;
}
