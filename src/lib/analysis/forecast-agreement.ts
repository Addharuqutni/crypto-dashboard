/**
 * Forecast Agreement Layer.
 *
 * Evaluates whether a forecast (e.g. Kronos) aligns with the deterministic
 * signal engine's output. The result adjusts confidence but NEVER creates
 * a trade from WAIT or overrides the risk engine.
 *
 * Rules:
 *   - WAIT + any forecast direction → neutral (no trade upgrade).
 *   - Aligned forecast + strong grade → small confidence boost (+7).
 *   - Aligned forecast + weak grade → smaller boost (+3).
 *   - Conflicting forecast → confidence penalty (-15).
 *   - Invalid/unavailable forecast → ignored (0 adjustment).
 */

import type { FuturesSignalAction, FuturesGrade } from '@/types/futures-signal';
import type { ForecastAgreementResult, ForecastSummary } from '@/types/forecast';

/**
 * Evaluates forecast agreement against the deterministic signal.
 *
 * @param args.action - The deterministic engine's final action (LONG/SHORT/WAIT).
 * @param args.grade - Coarse grade (A/B/C/D) from the signal engine.
 * @param args.forecast - Optional forecast summary from a provider.
 * @returns Agreement result with confidence adjustment and warnings.
 */
export function evaluateForecastAgreement(args: {
  action: FuturesSignalAction;
  grade: FuturesGrade;
  forecast?: ForecastSummary | null;
}): ForecastAgreementResult {
  const { action, grade, forecast } = args;

  // No forecast provided — cannot evaluate.
  if (!forecast) {
    return {
      alignment: 'unavailable',
      confidenceAdjustment: 0,
      warning: null,
      usedInDecision: false,
    };
  }

  // Forecast exists but is marked invalid (stale, corrupt, etc.).
  if (!forecast.valid) {
    return {
      alignment: 'invalid',
      confidenceAdjustment: 0,
      warning: 'Kronos forecast is invalid and was ignored.',
      usedInDecision: false,
    };
  }

  // WAIT signals are never upgraded by forecast agreement.
  if (action === 'WAIT') {
    return {
      alignment: 'neutral',
      confidenceAdjustment: 0,
      warning: null,
      usedInDecision: false,
    };
  }

  // Determine alignment.
  const aligned =
    (action === 'LONG' && forecast.direction === 'up') ||
    (action === 'SHORT' && forecast.direction === 'down');

  const conflicting =
    (action === 'LONG' && forecast.direction === 'down') ||
    (action === 'SHORT' && forecast.direction === 'up');

  if (aligned) {
    const strongGrade = grade === 'A' || grade === 'B';
    return {
      alignment: 'aligned',
      confidenceAdjustment: strongGrade ? 7 : 3,
      warning: null,
      usedInDecision: true,
    };
  }

  if (conflicting) {
    return {
      alignment: 'conflicting',
      confidenceAdjustment: -15,
      warning: 'Kronos forecast conflicts with deterministic signal.',
      usedInDecision: true,
    };
  }

  // Forecast direction is flat/uncertain — no meaningful signal.
  return {
    alignment: 'neutral',
    confidenceAdjustment: 0,
    warning: null,
    usedInDecision: false,
  };
}
