import type {
  FuturesFundingBias,
  FuturesOpenInterestBias,
  FuturesSignal,
} from '@/types/futures-signal';

/** Format freshness age in trader-friendly units. */
export function formatAge(ageSec: number | null): string {
  if (ageSec == null) return 'Unavailable';
  if (ageSec < 60) return `${Math.round(ageSec)}s ago`;
  if (ageSec < 3600) return `${Math.round(ageSec / 60)}m ago`;
  return `${(ageSec / 3600).toFixed(1)}h ago`;
}

/** Convert timeframe health into a compact availability label. */
export function availabilityLabel(health: FuturesSignal['dataHealth']['setup']): string {
  if (!health.required) return 'N/A';
  if (health.ok) return 'OK';
  if (health.candleCount <= 0) return 'Missing';
  return 'Stale';
}

export function fundingBiasLabel(b: FuturesFundingBias): string {
  switch (b) {
    case 'CROWDED_LONG':
      return 'Crowded long';
    case 'CROWDED_SHORT':
      return 'Crowded short';
    case 'SUPPORTS_LONG':
      return 'Supports long';
    case 'SUPPORTS_SHORT':
      return 'Supports short';
    case 'NEUTRAL':
      return 'Neutral';
    default:
      return '—';
  }
}

export function oiBiasLabel(b: FuturesOpenInterestBias): string {
  switch (b) {
    case 'BULLISH_CONTINUATION':
      return 'Bullish continuation';
    case 'BEARISH_CONTINUATION':
      return 'Bearish continuation';
    case 'SHORT_COVERING':
      return 'Short covering';
    case 'LONG_LIQUIDATION':
      return 'Long liquidation';
    case 'NEUTRAL':
      return 'Neutral';
    default:
      return '—';
  }
}
