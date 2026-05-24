import type { Candle } from '@/types/chart';
import type {
  FuturesEntryZone,
  FuturesRiskLevel,
  FuturesSignalAction,
  FuturesSignalConfig,
  FuturesSuggestedLeverage,
  FuturesTakeProfits,
} from '@/types/futures-signal';
import { DEFAULT_FUTURES_SIGNAL_CONFIG } from '@/types/futures-signal';

/**
 * Risk Engine.
 *
 * The risk engine is the final authority. Even a 95-confidence signal can be
 * downgraded to WAIT if:
 *   - volatility is extreme
 *   - price is overextended from EMA20 (chasing risk)
 *   - swing structure is missing
 *
 * Risk override beats signal score. This is intentional and non-negotiable.
 *
 * Take-profit model: fixed risk-multiple (1R, 2R, 3R). The RR gate validates
 * that the configured `minRiskReward` is achievable given this model. If the
 * config demands a higher RR than the fixed TP2 multiple can deliver, the
 * engine returns WAIT with a clear reason rather than silently passing.
 */

/** Fixed risk-multiple for TP2 — the primary target used for RR evaluation. */
const TP2_R_MULTIPLE = 2;

export interface RiskInputs {
  side: 'LONG' | 'SHORT';
  entry: number;
  candles: Candle[];
  atr: number;
  ema20: number | null;
  /** Pre-classified ATR / price ratio for volatility filtering. */
  atrPctOfPrice: number | null;
}

export interface RiskPlan {
  action: FuturesSignalAction;
  riskLevel: FuturesRiskLevel;
  entryZone: FuturesEntryZone;
  stopLoss: number | null;
  takeProfits: FuturesTakeProfits;
  riskRewardRatio: number | null;
  suggestedLeverage: FuturesSuggestedLeverage;
  invalidationReason: string;
  warnings: string[];
}

const NO_TRADE_LEVERAGE: FuturesSuggestedLeverage = { min: 0, max: 0 };

const LEVERAGE_BY_RISK: Record<Exclude<FuturesRiskLevel, 'NO_TRADE'>, FuturesSuggestedLeverage> = {
  LOW: { min: 3, max: 5 },
  MEDIUM: { min: 2, max: 3 },
  HIGH: { min: 1, max: 2 },
};

/**
 * Build a complete risk plan for a candidate signal.
 *
 * Returns either a tradeable plan with concrete entry/SL/TPs or a WAIT plan
 * with a clear invalidation reason. Callers should treat the returned
 * `action` as authoritative.
 */
export function buildRiskPlan(
  inputs: RiskInputs,
  config: FuturesSignalConfig = DEFAULT_FUTURES_SIGNAL_CONFIG
): RiskPlan {
  const { side, entry, candles, atr, ema20, atrPctOfPrice } = inputs;
  const warnings: string[] = [];

  // 1. Sanity guards.
  if (!Number.isFinite(entry) || entry <= 0 || !Number.isFinite(atr) || atr <= 0) {
    return waitPlan('Entry price or ATR is invalid.', warnings);
  }
  if (candles.length < config.swingLookback + 1) {
    return waitPlan(
      `Need at least ${config.swingLookback + 1} candles to derive a stop from swing structure.`,
      warnings
    );
  }

  // 2. Config sanity: reject impossible RR demands for the fixed-R model.
  if (config.minRiskReward > TP2_R_MULTIPLE) {
    return waitPlan(
      `Config minRiskReward (${config.minRiskReward}) exceeds the fixed TP2 multiple (${TP2_R_MULTIPLE}R). ` +
      `Adjust config or implement market-structure TP targets.`,
      warnings
    );
  }

  // 3. Volatility filter — extreme volatility forces WAIT.
  if (atrPctOfPrice != null && atrPctOfPrice >= config.extremeVolatilityRatio) {
    warnings.push(
      `Volatility is extreme (ATR is ${(atrPctOfPrice * 100).toFixed(2)}% of price).`
    );
    return waitPlan('Volatility is too extreme to define a safe stop.', warnings);
  }

  // 4. Overextension filter — too far from EMA20 = chasing.
  if (ema20 != null && ema20 > 0) {
    const distancePct = Math.abs(entry - ema20) / ema20;
    if (distancePct >= config.overextensionRatio) {
      warnings.push('Price is overextended from EMA20. Avoid chasing.');
      return waitPlan(
        `Entry is ${(distancePct * 100).toFixed(2)}% away from EMA20 — overextended.`,
        warnings
      );
    }
  }

  // 5. Derive stop loss from the more conservative of: recent swing or ATR.
  const recent = candles.slice(-config.swingLookback);
  let swingHigh = -Infinity;
  let swingLow = Infinity;
  for (const c of recent) {
    if (c.high > swingHigh) swingHigh = c.high;
    if (c.low < swingLow) swingLow = c.low;
  }

  const atrBuffer = atr * config.atrStopMultiplier;
  let stopLoss: number;
  if (side === 'LONG') {
    // Use the deeper of the two stops to avoid noise wicks knocking us out.
    const swingStop = swingLow - atr * 0.25; // small cushion below swing
    const atrStop = entry - atrBuffer;
    stopLoss = Math.min(swingStop, atrStop);
  } else {
    const swingStop = swingHigh + atr * 0.25;
    const atrStop = entry + atrBuffer;
    stopLoss = Math.max(swingStop, atrStop);
  }

  // 6. Derive take profits using fixed risk multiples (1R, 2R, 3R).
  const risk = side === 'LONG' ? entry - stopLoss : stopLoss - entry;
  if (risk <= 0) {
    return waitPlan('Computed stop is on the wrong side of entry.', warnings);
  }

  const tp1 = side === 'LONG' ? entry + risk * 1 : entry - risk * 1;
  const tp2 = side === 'LONG' ? entry + risk * TP2_R_MULTIPLE : entry - risk * TP2_R_MULTIPLE;
  const tp3 = side === 'LONG' ? entry + risk * 3 : entry - risk * 3;

  // RR is always TP2_R_MULTIPLE by construction in the fixed-R model.
  const riskRewardRatio = TP2_R_MULTIPLE;

  // 7. Risk:reward floor — already validated against config in step 2, but
  //    kept as a runtime assertion for safety.
  if (riskRewardRatio < config.minRiskReward) {
    return waitPlan(
      `Risk:reward ${riskRewardRatio.toFixed(2)} is below minimum ${config.minRiskReward}.`,
      warnings
    );
  }

  // 8. Risk level — bigger ATR/price ratio = higher risk = lower leverage.
  let riskLevel: Exclude<FuturesRiskLevel, 'NO_TRADE'> = 'MEDIUM';
  if (atrPctOfPrice != null) {
    if (atrPctOfPrice < 0.012) riskLevel = 'LOW';
    else if (atrPctOfPrice < 0.025) riskLevel = 'MEDIUM';
    else riskLevel = 'HIGH';
  }

  // 9. Entry zone — small symmetric band around entry to absorb micro-noise.
  const halfBand = atr * 0.25;
  const entryZone: FuturesEntryZone = {
    min: entry - halfBand,
    max: entry + halfBand,
  };

  return {
    action: side,
    riskLevel,
    entryZone,
    stopLoss,
    takeProfits: { tp1, tp2, tp3 },
    riskRewardRatio,
    suggestedLeverage: LEVERAGE_BY_RISK[riskLevel],
    invalidationReason:
      side === 'LONG'
        ? `Trade is invalidated if price closes below ${stopLoss.toFixed(4)}.`
        : `Trade is invalidated if price closes above ${stopLoss.toFixed(4)}.`,
    warnings,
  };
}

/** Build a WAIT plan with the supplied reason and accumulated warnings. */
function waitPlan(reason: string, warnings: string[]): RiskPlan {
  return {
    action: 'WAIT',
    riskLevel: 'NO_TRADE',
    entryZone: { min: null, max: null },
    stopLoss: null,
    takeProfits: { tp1: null, tp2: null, tp3: null },
    riskRewardRatio: null,
    suggestedLeverage: NO_TRADE_LEVERAGE,
    invalidationReason: reason,
    warnings,
  };
}
