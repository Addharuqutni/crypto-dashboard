import type { RiskProfile, RiskProfileId } from '@/types/intelligence';

/**
 * Phase 4 — risk profile presets.
 *
 * Profiles are the single knob users tune to express discipline preference.
 * They influence:
 *   - the worker's `minConfidenceToAlert`
 *   - the engine's minimum risk:reward ratio
 *   - the leverage ceiling shown in the UI
 *   - whether countertrend setups are even considered
 *   - how aggressively alerts are throttled
 *
 * The presets are pure data. Consumers must explicitly call `applyProfile()`
 * to merge them into a worker config or signal threshold; the profile
 * itself never mutates anything.
 */

export const RISK_PROFILES: Record<RiskProfileId, RiskProfile> = {
  conservative: {
    id: 'conservative',
    label: 'Conservative',
    description:
      'Capital preservation first. Only A/A+ setups with tight risk and aligned trends.',
    minConfidence: 75,
    minRiskReward: 2.5,
    maxLeverage: 3,
    allowCountertrend: false,
    cooldownMultiplier: 1.5,
  },
  balanced: {
    id: 'balanced',
    label: 'Balanced',
    description:
      'Default discipline. Trades aligned with the 4H regime, RR ≥ 2, no countertrend.',
    minConfidence: 65,
    minRiskReward: 2,
    maxLeverage: 5,
    allowCountertrend: false,
    cooldownMultiplier: 1,
  },
  aggressive: {
    id: 'aggressive',
    label: 'Aggressive',
    description:
      'Higher signal frequency. Considers B-grade setups and selected countertrend trades.',
    minConfidence: 55,
    minRiskReward: 1.7,
    maxLeverage: 8,
    allowCountertrend: true,
    cooldownMultiplier: 0.75,
  },
  scalper: {
    id: 'scalper',
    label: 'Scalper',
    description:
      'Short-hold setups on tight RR. Use only on liquid pairs and during normal volatility.',
    minConfidence: 60,
    minRiskReward: 1.5,
    maxLeverage: 5,
    allowCountertrend: false,
    cooldownMultiplier: 0.5,
  },
  swing: {
    id: 'swing',
    label: 'Swing',
    description:
      'Multi-day holds. Stricter trend alignment and higher RR — fewer but larger moves.',
    minConfidence: 70,
    minRiskReward: 3,
    maxLeverage: 3,
    allowCountertrend: false,
    cooldownMultiplier: 2,
  },
};

export function getRiskProfile(id: RiskProfileId): RiskProfile {
  return RISK_PROFILES[id];
}

/**
 * Apply a profile's discipline knobs to a base configuration object.
 *
 * Returns a new object — the input is never mutated. Numeric fields take
 * the *stricter* value of the two so users can ratchet discipline up via a
 * profile but never relax it past the engine's own floor.
 */
export interface DisciplineThresholds {
  minConfidence: number;
  minRiskReward: number;
  maxLeverage: number;
  allowCountertrend: boolean;
  cooldownMultiplier: number;
}

export function applyProfile(
  base: DisciplineThresholds,
  profile: RiskProfile
): DisciplineThresholds {
  return {
    minConfidence: Math.max(base.minConfidence, profile.minConfidence),
    minRiskReward: Math.max(base.minRiskReward, profile.minRiskReward),
    maxLeverage: Math.min(base.maxLeverage, profile.maxLeverage),
    allowCountertrend: base.allowCountertrend && profile.allowCountertrend,
    cooldownMultiplier: Math.max(base.cooldownMultiplier, profile.cooldownMultiplier),
  };
}
