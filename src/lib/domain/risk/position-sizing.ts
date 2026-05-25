/**
 * Position-sizing calculator.
 *
 * Pure, deterministic conversion from engine entry/SL + account context
 * into a concrete trade plan: how much to buy/short, the notional value,
 * the leverage that has to be deployed, and whether that leverage breaks
 * the user's profile ceiling.
 *
 * Why this is its own module:
 *   - It is the missing piece between "engine says LONG @ X with SL Y" and
 *     "I should open a $42 BTC position with 2x leverage". Centralising it
 *     keeps the math one place, easy to test, easy to audit.
 *   - It is consumed by the screener drawer today and can be reused by the
 *     journal and worker without duplication.
 *   - The output is intentionally conservative: when the required leverage
 *     exceeds the profile cap we *do not* silently reduce position size —
 *     we surface the conflict so the trader can decide whether to lower
 *     `riskPerTrade` or accept a smaller position via cap.
 *
 * What we do NOT do here:
 *   - We never recommend changing the entry or stop. Risk-engine output is
 *     authoritative.
 *   - We never apply fees/slippage. The journal owns realised PnL; this is
 *     a planning view only.
 *   - We never fabricate a stop when the engine returned WAIT.
 */

export interface PositionSizingInputs {
  side: 'LONG' | 'SHORT';
  /** Entry price (USDT-quoted). */
  entry: number;
  /** Stop loss price (USDT-quoted). */
  stopLoss: number;
  /** Total account equity in USDT. */
  accountSize: number;
  /** Risk per trade as a fraction of equity (0.01 = 1%). */
  riskPerTrade: number;
  /** Leverage ceiling derived from the user's risk profile. */
  maxLeverage: number;
  /** Engine's suggested leverage range. The capped leverage is the smaller of
   *  this max and the profile's max. */
  suggestedLeverage?: { min: number; max: number } | null;
}

export type PositionSizingError =
  | 'invalid_side'
  | 'invalid_entry'
  | 'invalid_stop_loss'
  | 'invalid_account_size'
  | 'invalid_risk_per_trade'
  | 'invalid_max_leverage'
  | 'stop_on_wrong_side'
  | 'risk_distance_too_small';

export interface PositionSizingPlan {
  /** USDT amount the trader stands to lose if SL is hit (gross of fees). */
  riskAmount: number;
  /** Absolute price distance from entry to stop. */
  rDistance: number;
  /** Distance to stop as a percent of entry. Useful for compare-across-setups. */
  rDistancePct: number;
  /** Position size in base asset units (e.g. 0.0123 BTC). */
  qty: number;
  /** Notional value of the position in USDT (qty * entry). */
  notional: number;
  /** Leverage required to hold the notional given the account size. */
  requiredLeverage: number;
  /** The leverage cap actually applied — min(profile max, engine suggested max). */
  cappedLeverage: number;
  /** True when the required leverage exceeds the cap. The trader should lower
   *  `riskPerTrade` or accept a smaller position. */
  leverageExceedsCap: boolean;
  /** Margin needed at the capped leverage to hold the notional.
   *  Falls back to the full notional when the cap is non-positive. */
  marginAtCappedLeverage: number;
  /** Notional sized to fit exactly under the capped leverage. Equal to
   *  `notional` when the cap is not breached. */
  cappedNotional: number;
  /** Position size in base asset units sized to fit under the cap. */
  cappedQty: number;
  /** Effective USDT risk after capping (may be smaller than `riskAmount`
   *  when the cap forced a smaller position). */
  cappedRiskAmount: number;
}

export type PositionSizingOutcome =
  | { ok: true; plan: PositionSizingPlan }
  | { ok: false; error: PositionSizingError; message: string };

const MIN_RISK_DISTANCE_PCT = 0.0001; // 0.01% — guards divide-by-zero and absurd sizes.

/**
 * Compute a position plan from engine inputs and account context.
 *
 * Returns a discriminated union so callers can render an actionable error
 * message instead of guessing why the calculation refused.
 */
export function computePositionSize(inputs: PositionSizingInputs): PositionSizingOutcome {
  const {
    side,
    entry,
    stopLoss,
    accountSize,
    riskPerTrade,
    maxLeverage,
    suggestedLeverage,
  } = inputs;

  if (side !== 'LONG' && side !== 'SHORT') {
    return fail('invalid_side', 'Side must be LONG or SHORT.');
  }
  if (!Number.isFinite(entry) || entry <= 0) {
    return fail('invalid_entry', 'Entry price must be a positive number.');
  }
  if (!Number.isFinite(stopLoss) || stopLoss <= 0) {
    return fail('invalid_stop_loss', 'Stop loss must be a positive number.');
  }
  if (!Number.isFinite(accountSize) || accountSize <= 0) {
    return fail('invalid_account_size', 'Account size must be a positive number.');
  }
  if (!Number.isFinite(riskPerTrade) || riskPerTrade <= 0 || riskPerTrade > 1) {
    return fail(
      'invalid_risk_per_trade',
      'Risk per trade must be a fraction between 0 and 1 (exclusive of 0).'
    );
  }
  if (!Number.isFinite(maxLeverage) || maxLeverage <= 0) {
    return fail('invalid_max_leverage', 'Max leverage must be a positive number.');
  }

  // Stop on wrong side check — a LONG stop must be below entry; SHORT above.
  if (side === 'LONG' && stopLoss >= entry) {
    return fail(
      'stop_on_wrong_side',
      'For a LONG, stop loss must be strictly below entry.'
    );
  }
  if (side === 'SHORT' && stopLoss <= entry) {
    return fail(
      'stop_on_wrong_side',
      'For a SHORT, stop loss must be strictly above entry.'
    );
  }

  const rDistance = Math.abs(entry - stopLoss);
  const rDistancePct = rDistance / entry;

  if (rDistancePct < MIN_RISK_DISTANCE_PCT) {
    return fail(
      'risk_distance_too_small',
      'Stop is too close to entry — distance is below 0.01% of price.'
    );
  }

  // Risk-first sizing: qty = (account * risk%) / per-unit risk.
  const riskAmount = accountSize * riskPerTrade;
  const qty = riskAmount / rDistance;
  const notional = qty * entry;

  // Required leverage to hold this notional given the account.
  const requiredLeverage = notional / accountSize;

  // Cap is the stricter of the profile cap and the engine's suggested max.
  const engineMax =
    suggestedLeverage && Number.isFinite(suggestedLeverage.max) && suggestedLeverage.max > 0
      ? suggestedLeverage.max
      : Infinity;
  const cappedLeverage = Math.max(0, Math.min(maxLeverage, engineMax));

  const leverageExceedsCap = cappedLeverage > 0 && requiredLeverage > cappedLeverage;

  // When the required leverage breaches the cap we honour the cap and
  // compute the smaller-but-safe alternative position. Risk drops too —
  // this is the intentional, conservative fallback.
  const cappedNotional = leverageExceedsCap ? accountSize * cappedLeverage : notional;
  const cappedQty = cappedNotional / entry;
  const cappedRiskAmount = cappedQty * rDistance;
  const marginAtCappedLeverage =
    cappedLeverage > 0 ? cappedNotional / cappedLeverage : cappedNotional;

  return {
    ok: true,
    plan: {
      riskAmount: round8(riskAmount),
      rDistance: round8(rDistance),
      rDistancePct: round8(rDistancePct),
      qty: round8(qty),
      notional: round8(notional),
      requiredLeverage: round4(requiredLeverage),
      cappedLeverage: round4(cappedLeverage),
      leverageExceedsCap,
      marginAtCappedLeverage: round8(marginAtCappedLeverage),
      cappedNotional: round8(cappedNotional),
      cappedQty: round8(cappedQty),
      cappedRiskAmount: round8(cappedRiskAmount),
    },
  };
}

/** Describe a position-sizing error for UI display. */
export function describePositionSizingError(error: PositionSizingError): string {
  switch (error) {
    case 'invalid_side':
      return 'Action must be LONG or SHORT to size a position.';
    case 'invalid_entry':
      return 'Engine entry price is missing or invalid.';
    case 'invalid_stop_loss':
      return 'Engine stop loss is missing or invalid.';
    case 'invalid_account_size':
      return 'Set a positive account size to size positions.';
    case 'invalid_risk_per_trade':
      return 'Risk per trade must be between 0% and 100%.';
    case 'invalid_max_leverage':
      return 'Profile leverage cap must be positive.';
    case 'stop_on_wrong_side':
      return 'Stop loss is on the wrong side of entry.';
    case 'risk_distance_too_small':
      return 'Stop is too tight to derive a meaningful size.';
  }
}

function fail(error: PositionSizingError, message: string): PositionSizingOutcome {
  return { ok: false, error, message };
}

function round8(v: number): number {
  if (!Number.isFinite(v)) return v;
  return Math.round(v * 1e8) / 1e8;
}

function round4(v: number): number {
  if (!Number.isFinite(v)) return v;
  return Math.round(v * 1e4) / 1e4;
}
