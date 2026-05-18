/**
 * Forecast types — infrastructure for Kronos and future forecast providers.
 *
 * These types define the contract between the forecast layer and the
 * deterministic signal engine. Forecasts are SUPPORTING EVIDENCE only.
 * They cannot create trades or override the risk engine.
 */

export type ForecastDirection = 'up' | 'down' | 'flat' | 'uncertain';

export type ForecastAlignment =
  | 'aligned'
  | 'conflicting'
  | 'neutral'
  | 'invalid'
  | 'unavailable';

export type ForecastProvider = 'kronos';

/**
 * Summary of a single forecast from a provider.
 *
 * `valid` must be true for the forecast to influence confidence.
 * Invalid or stale forecasts are ignored by the agreement layer.
 */
export interface ForecastSummary {
  provider: ForecastProvider;
  symbol: string;
  timeframe: string;
  valid: boolean;
  direction: ForecastDirection;
  expectedReturnPct: number | null;
  forecastVolatilityPct: number | null;
  confidenceProxy: number | null;
  warnings: string[];
}

/**
 * Result of evaluating forecast agreement against the deterministic signal.
 *
 * `usedInDecision` is true only when the forecast materially affected
 * the confidence score (aligned boost or conflicting penalty).
 */
export interface ForecastAgreementResult {
  alignment: ForecastAlignment;
  confidenceAdjustment: number;
  warning: string | null;
  usedInDecision: boolean;
}
