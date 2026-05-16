import type {
  FuturesFundingBias,
  FuturesSignalAction,
  FuturesSignalConfig,
} from '@/types/futures-signal';
import { DEFAULT_FUTURES_SIGNAL_CONFIG } from '@/types/futures-signal';

/**
 * Funding Rate Filter.
 *
 * Funding does NOT generate signals on its own. It's a confirmation/contra
 * filter:
 *   - Strongly positive funding while long  -> crowded long, squeeze risk
 *   - Strongly negative funding while short -> crowded short, squeeze risk
 *
 * If funding data is unavailable the filter degrades gracefully and returns
 * an UNAVAILABLE bias.
 */

export interface FundingFilterResult {
  bias: FuturesFundingBias;
  /** Confidence score adjustment in absolute points (positive or negative). */
  scoreAdjustment: number;
  warnings: string[];
}

/**
 * Classify funding for a candidate side.
 *
 *   action !== 'LONG'/'SHORT': returns NEUTRAL with no adjustment.
 *   funding == null:           returns UNAVAILABLE with mild warning if extreme.
 */
export function applyFundingFilter(
  action: FuturesSignalAction,
  fundingRate: number | null | undefined,
  config: FuturesSignalConfig = DEFAULT_FUTURES_SIGNAL_CONFIG
): FundingFilterResult {
  if (fundingRate == null || !Number.isFinite(fundingRate)) {
    return {
      bias: 'UNAVAILABLE',
      scoreAdjustment: 0,
      warnings: [],
    };
  }

  const threshold = config.fundingCrowdedThreshold;
  const warnings: string[] = [];
  let bias: FuturesFundingBias = 'NEUTRAL';
  let scoreAdjustment = 0;

  // Crowded long: positive funding above threshold.
  if (fundingRate > threshold) {
    if (action === 'LONG') {
      bias = 'CROWDED_LONG';
      scoreAdjustment = -8;
      warnings.push('Crowded long positioning detected. Long squeeze risk is elevated.');
    } else if (action === 'SHORT') {
      bias = 'SUPPORTS_SHORT';
      scoreAdjustment = 4;
    } else {
      bias = 'CROWDED_LONG';
    }
    return { bias, scoreAdjustment, warnings };
  }

  // Crowded short: negative funding below threshold.
  if (fundingRate < -threshold) {
    if (action === 'SHORT') {
      bias = 'CROWDED_SHORT';
      scoreAdjustment = -8;
      warnings.push('Crowded short positioning detected. Short squeeze risk is elevated.');
    } else if (action === 'LONG') {
      bias = 'SUPPORTS_LONG';
      scoreAdjustment = 4;
    } else {
      bias = 'CROWDED_SHORT';
    }
    return { bias, scoreAdjustment, warnings };
  }

  // Within neutral band.
  return { bias: 'NEUTRAL', scoreAdjustment: 0, warnings: [] };
}
