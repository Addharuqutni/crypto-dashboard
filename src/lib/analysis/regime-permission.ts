import type {
  FuturesMarketRegime,
  FuturesMarketRegimeId,
  FuturesTradePermission,
} from '@/types/futures-signal';

/**
 * Regime + Trade Permission mapping.
 *
 * The futures engine internally classifies markets using the legacy
 * `FuturesMarketRegime` enum (uppercase). The strict pipeline exposes the
 * spec's canonical lowercase ids and a derived `tradePermission` so consumers
 * (UI + risk gate) can rely on a single, stable vocabulary.
 *
 * The 4H (macro) regime is treated as the directional authority. The setup
 * timeframe regime is only used as a fallback when macro context is missing.
 *
 * Permission rules:
 *   - bullish_trend  → long_only   (refuse counter-trend shorts on weak setups)
 *   - bearish_trend  → short_only
 *   - range          → both        (fades inside the range are still allowed)
 *   - choppy         → no_trade    (defensive default for noisy regimes)
 *   - volatile       → no_trade    (extreme ATR — capital preservation first)
 *   - unknown        → no_trade    (data missing → refuse)
 */

/**
 * Convert the legacy `FuturesMarketRegime` to the spec's lowercase id.
 *
 * `INSUFFICIENT_DATA` → `unknown`. The engine separately classifies extreme
 * volatility into `volatile` once it has the ATR/price ratio in hand; this
 * helper only handles the regime label.
 */
export function toMarketRegimeId(
  regime: FuturesMarketRegime,
  opts?: { isVolatile?: boolean }
): FuturesMarketRegimeId {
  if (opts?.isVolatile) return 'volatile';
  switch (regime) {
    case 'BULLISH_TREND':
      return 'bullish_trend';
    case 'BEARISH_TREND':
      return 'bearish_trend';
    case 'RANGE':
      return 'range';
    case 'CHOP_HIGH_RISK':
      return 'choppy';
    case 'INSUFFICIENT_DATA':
    default:
      return 'unknown';
  }
}

/**
 * Derive the trade permission from the macro regime id.
 *
 * Pure function; treats `unknown` defensively as `no_trade` so the engine
 * never assumes a direction in the absence of 4H context.
 */
export function deriveTradePermission(
  macroRegime: FuturesMarketRegimeId
): FuturesTradePermission {
  switch (macroRegime) {
    case 'bullish_trend':
      return 'long_only';
    case 'bearish_trend':
      return 'short_only';
    case 'range':
      return 'both';
    case 'choppy':
    case 'volatile':
    case 'unknown':
    default:
      return 'no_trade';
  }
}

/**
 * Decide whether the candidate side is allowed under the current trade
 * permission. Returns null when the side is allowed; otherwise returns a
 * short, user-readable reason.
 */
export function checkPermission(
  side: 'LONG' | 'SHORT',
  permission: FuturesTradePermission
): string | null {
  if (permission === 'no_trade') {
    return '4H regime is not tradeable. No directional setups allowed.';
  }
  if (permission === 'long_only' && side === 'SHORT') {
    return '4H regime is bullish. Short setups are blocked.';
  }
  if (permission === 'short_only' && side === 'LONG') {
    return '4H regime is bearish. Long setups are blocked.';
  }
  return null;
}

/**
 * Map the existing fine-grained `signalGrade` (A+/A/B/C/D) to the strict
 * pipeline's coarse A/B/C/D grade. A+ collapses to A; everything else passes
 * through.
 */
export function toCoarseGrade(grade: 'A+' | 'A' | 'B' | 'C' | 'D'): 'A' | 'B' | 'C' | 'D' {
  return grade === 'A+' ? 'A' : grade;
}
