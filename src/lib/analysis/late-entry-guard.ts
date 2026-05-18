/**
 * Late Entry Guard.
 *
 * Prevents chasing entries that are technically valid by trend/regime but
 * practically dangerous because the move is already extended. Checks:
 *
 *   1. Bearish trend + RSI oversold near support → block SHORT.
 *   2. Bullish trend + RSI overbought near resistance → block LONG.
 *   3. Price stretched from EMA20 + weak volume → block any side.
 *
 * When blocked, the signal engine should downgrade to WAIT and preserve
 * the original bias in warnings for the user's awareness.
 */

export interface LateEntryGuardInput {
  side: 'LONG' | 'SHORT';
  macroRegime:
    | 'bullish_trend'
    | 'bearish_trend'
    | 'range'
    | 'choppy'
    | 'volatile'
    | 'unknown';
  setupRsi: number | null;
  triggerRsi: number | null;
  distanceFromEma20Pct: number | null;
  nearSupport: boolean;
  nearResistance: boolean;
  volumeIsWeak: boolean;
}

export interface LateEntryGuardResult {
  blocked: boolean;
  reason: string | null;
  severity: 'info' | 'warning' | 'block';
}

/**
 * Evaluates whether the current entry is "too late" given the market context.
 *
 * Returns `blocked: true` when the setup is technically valid but the entry
 * timing is dangerous (oversold/overbought near key levels, or stretched
 * from EMA20 with weak volume).
 */
export function evaluateLateEntryGuard(input: LateEntryGuardInput): LateEntryGuardResult {
  const {
    side,
    macroRegime,
    setupRsi,
    triggerRsi,
    distanceFromEma20Pct,
    nearSupport,
    nearResistance,
    volumeIsWeak,
  } = input;

  // Block: SHORT in bearish trend but RSI is already oversold near support.
  if (
    side === 'SHORT' &&
    macroRegime === 'bearish_trend' &&
    ((setupRsi != null && setupRsi < 28) || (triggerRsi != null && triggerRsi < 30)) &&
    nearSupport
  ) {
    return {
      blocked: true,
      severity: 'block',
      reason:
        'Bearish trend is valid, but entry is late: RSI is oversold near support. Wait for pullback rejection or clean breakdown.',
    };
  }

  // Block: LONG in bullish trend but RSI is already overbought near resistance.
  if (
    side === 'LONG' &&
    macroRegime === 'bullish_trend' &&
    ((setupRsi != null && setupRsi > 72) || (triggerRsi != null && triggerRsi > 70)) &&
    nearResistance
  ) {
    return {
      blocked: true,
      severity: 'block',
      reason:
        'Bullish trend is valid, but entry is late: RSI is overbought near resistance. Wait for pullback retest or clean breakout.',
    };
  }

  // Block: Price stretched from EMA20 with weak volume — avoid chasing.
  if (distanceFromEma20Pct != null && distanceFromEma20Pct > 1.5 && volumeIsWeak) {
    return {
      blocked: true,
      severity: 'block',
      reason: 'Price is stretched from EMA20 with weak volume. Avoid chasing; wait for retest.',
    };
  }

  return { blocked: false, severity: 'info', reason: null };
}
