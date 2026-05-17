export type PriceFreshness = 'live' | 'delayed' | 'stale';

export const LIVE_PRICE_MAX_AGE_MS = 5_000;
export const STALE_PRICE_MAX_AGE_MS = 15_000;

/**
 * Classifies a locally received market price by age.
 * Centralizing the thresholds keeps market table, watchlist, and future widgets
 * consistent when tuning realtime freshness behavior.
 */
export function getPriceFreshness(receivedAt: number | undefined, now = Date.now()): PriceFreshness {
  if (!receivedAt) return 'stale';

  const age = now - receivedAt;
  if (age <= LIVE_PRICE_MAX_AGE_MS) return 'live';
  if (age <= STALE_PRICE_MAX_AGE_MS) return 'delayed';
  return 'stale';
}

/** Returns a concise user-facing freshness label for realtime price badges. */
export function getPriceFreshnessLabel(freshness: PriceFreshness): string {
  switch (freshness) {
    case 'live':
      return 'Live';
    case 'delayed':
      return 'Delayed';
    case 'stale':
      return 'Stale';
  }
}

/** Formats the local age of a market tick for tooltips and screen readers. */
export function formatPriceAge(receivedAt: number | undefined, now = Date.now()): string {
  if (!receivedAt) return 'No live update received yet';

  const ageSeconds = Math.max(0, Math.round((now - receivedAt) / 1000));
  if (ageSeconds < 1) return 'Updated just now';
  if (ageSeconds === 1) return 'Updated 1 second ago';
  return `Updated ${ageSeconds} seconds ago`;
}
