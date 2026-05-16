import type { Candle } from '@/types/chart';
import type {
  FuturesBias,
  FuturesMtfConfirmation,
  FuturesSignalConfig,
} from '@/types/futures-signal';
import { DEFAULT_FUTURES_SIGNAL_CONFIG } from '@/types/futures-signal';
import { detectRegime } from './regime-detector';

/**
 * Multi-Timeframe Confirmation Engine.
 *
 * Maps regime + EMA alignment from up to three timeframes into a single
 * `FuturesMtfConfirmation`. The setup timeframe is the user's currently
 * selected chart; macro/trigger are optional.
 *
 *   macro   (recommended 4H)  — sets the directional bias the engine should respect
 *   setup   (the chart TF)    — confirms the entry context
 *   trigger (recommended 15m) — last-mile confirmation
 *
 * Pure module — does not fetch anything. Caller supplies candles for each TF.
 */

export interface MtfInput {
  setupCandles: Candle[];
  macroCandles?: Candle[];
  triggerCandles?: Candle[];
}

/**
 * Derive a directional bias from a candle set using regime + EMA stack.
 *
 * The bias is conservative: only clean trends produce BULLISH/BEARISH;
 * everything else is NEUTRAL. INSUFFICIENT_DATA short-circuits early.
 */
export function deriveBias(candles: Candle[] | undefined, config = DEFAULT_FUTURES_SIGNAL_CONFIG): FuturesBias {
  if (!candles || candles.length === 0) return 'INSUFFICIENT_DATA';
  const ctx = detectRegime(candles, config);
  if (ctx.regime === 'INSUFFICIENT_DATA') return 'INSUFFICIENT_DATA';
  if (ctx.regime === 'BULLISH_TREND') return 'BULLISH';
  if (ctx.regime === 'BEARISH_TREND') return 'BEARISH';
  // RANGE / CHOP_HIGH_RISK collapse to NEUTRAL — caller decides what to do.
  return 'NEUTRAL';
}

/**
 * Calculate alignment + conflicts across (macro, setup, trigger) biases.
 *
 * Score is 0..100 where:
 *   100 = all three aligned in the same direction
 *   80  = setup + one of (macro|trigger) aligned, other neutral
 *   60  = partial alignment (one neutral OR one mismatch on trigger only)
 *   40  = mixed / conflicting
 *   <40 = strong conflict (macro vs setup direct opposites)
 */
export function buildMtfConfirmation(
  input: MtfInput,
  config: FuturesSignalConfig = DEFAULT_FUTURES_SIGNAL_CONFIG
): FuturesMtfConfirmation {
  const setupBias = deriveBias(input.setupCandles, config);
  const macroBias = deriveBias(input.macroCandles, config);
  const triggerBias = deriveBias(input.triggerCandles, config);

  const conflicts: string[] = [];

  // Direct macro vs setup conflict — most severe.
  if (
    (macroBias === 'BULLISH' && setupBias === 'BEARISH') ||
    (macroBias === 'BEARISH' && setupBias === 'BULLISH')
  ) {
    conflicts.push(`Macro bias is ${macroBias} but setup bias is ${setupBias}.`);
  }

  // Setup vs trigger conflict — less severe but still notable.
  if (
    (setupBias === 'BULLISH' && triggerBias === 'BEARISH') ||
    (setupBias === 'BEARISH' && triggerBias === 'BULLISH')
  ) {
    conflicts.push(`Setup bias is ${setupBias} but trigger bias is ${triggerBias}.`);
  }

  // INSUFFICIENT_DATA on macro is treated as missing context, not conflict.
  // Only setup INSUFFICIENT_DATA blocks the system from acting.
  const alignmentScore = computeAlignmentScore(macroBias, setupBias, triggerBias);

  // Don't add a conflict for missing macro data — that's reported via score
  // and bias instead. We only flag genuine *contradictions*.

  return {
    macroBias,
    setupBias,
    triggerBias,
    alignmentScore,
    conflicts,
  };
}

function computeAlignmentScore(
  macro: FuturesBias,
  setup: FuturesBias,
  trigger: FuturesBias
): number {
  if (setup === 'INSUFFICIENT_DATA') return 0;

  // Each TF contributes a directional vote: +1 bullish, -1 bearish, 0 neutral/missing.
  const v = (b: FuturesBias): number =>
    b === 'BULLISH' ? 1 : b === 'BEARISH' ? -1 : 0;

  const m = v(macro);
  const s = v(setup);
  const t = v(trigger);

  // If setup is neutral, alignment is at best lukewarm.
  if (s === 0) return 50;

  // Direct opposition between macro and setup is the worst case.
  if ((m === 1 && s === -1) || (m === -1 && s === 1)) return 25;

  // Setup + matching macro + matching trigger: best alignment.
  if (m === s && t === s) return 95;

  // Setup + matching macro, trigger neutral.
  if (m === s && t === 0) return 80;

  // Setup + matching trigger, macro neutral/missing.
  if (s === t && m === 0) return 70;

  // Setup direction with macro neutral and trigger neutral.
  if (m === 0 && t === 0) return 60;

  // Setup matches one of macro/trigger but the other contradicts — partial.
  if ((m === s && t === -s) || (t === s && m === -s)) return 45;

  // Fallback — mixed but not strictly opposite.
  return 50;
}
