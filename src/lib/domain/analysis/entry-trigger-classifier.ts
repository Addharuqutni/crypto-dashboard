import type { Candle } from '@/types/chart';
import type {
  FuturesEntryTrigger,
  FuturesLiquiditySweep,
  FuturesMarketRegime,
  FuturesSignalAction,
} from '@/types/futures-signal';
import type { SupportResistance } from '@/lib/domain/indicators/support-resistance';

/**
 * Entry Trigger Classifier.
 *
 * Picks the most appropriate entry mechanic for a candidate side given the
 * current candle, regime, support/resistance, EMAs, and any detected sweep.
 *
 *   BREAKOUT                  — close beyond SR with volume confirmation
 *   PULLBACK_RETEST           — price retests EMA20/EMA50 and holds
 *   LIQUIDITY_SWEEP_REVERSAL  — sweep detected and reclaimed
 *   TREND_CONTINUATION        — strong trend, momentum aligned, no clean retest
 *   RANGE_REVERSION           — range regime, price rejects boundary
 *   NO_TRIGGER                — no clean entry mechanic
 *
 * Heuristic — ordered checks from highest specificity to lowest. Caller
 * should treat NO_TRIGGER as a strong reason to WAIT.
 */

export interface ClassifyTriggerInput {
  side: FuturesSignalAction;
  candles: Candle[];
  regime: FuturesMarketRegime;
  ema20: number | null;
  ema50: number | null;
  ema200: number | null;
  supportResistance?: SupportResistance;
  liquiditySweep: FuturesLiquiditySweep;
  /** Recent (e.g. 20-bar) average volume; used to validate breakout volume. */
  recentAvgVolume: number | null;
}

/**

 * Menjalankan logic classify entry trigger.

 * Dipakai untuk memisahkan tanggung jawab fungsi ini dari bagian aplikasi lain.

 */

export function classifyEntryTrigger(input: ClassifyTriggerInput): FuturesEntryTrigger {
  if (input.side === 'WAIT') return 'NO_TRIGGER';
  if (input.candles.length < 2) return 'NO_TRIGGER';

  const last = input.candles[input.candles.length - 1];
  if (!last) return 'NO_TRIGGER';

  const sweep = input.liquiditySweep;

  // 1. Sweep reversal — requires sweep on the supportive side with reasonable confidence.
  if (
    sweep.type === 'BULLISH_SWEEP' &&
    input.side === 'LONG' &&
    sweep.confidence >= 30
  ) {
    return 'LIQUIDITY_SWEEP_REVERSAL';
  }
  if (
    sweep.type === 'BEARISH_SWEEP' &&
    input.side === 'SHORT' &&
    sweep.confidence >= 30
  ) {
    return 'LIQUIDITY_SWEEP_REVERSAL';
  }

  // 2. Range reversion — only valid in RANGE regime, near the wrong-side boundary.
  if (input.regime === 'RANGE' && input.supportResistance) {
    const { support, resistance } = input.supportResistance;
    if (
      input.side === 'LONG' &&
      support != null &&
      resistance != null &&
      Math.abs(last.low - support) / support < 0.01 &&
      last.close > last.open
    ) {
      return 'RANGE_REVERSION';
    }
    if (
      input.side === 'SHORT' &&
      support != null &&
      resistance != null &&
      Math.abs(last.high - resistance) / resistance < 0.01 &&
      last.close < last.open
    ) {
      return 'RANGE_REVERSION';
    }
  }

  // 3. Breakout — close beyond SR with volume confirmation.
  if (input.supportResistance) {
    const { support, resistance } = input.supportResistance;
    const volumeOk =
      input.recentAvgVolume != null &&
      input.recentAvgVolume > 0 &&
      last.volume / input.recentAvgVolume >= 1.2;

    if (
      input.side === 'LONG' &&
      resistance != null &&
      last.close > resistance &&
      volumeOk
    ) {
      return 'BREAKOUT';
    }
    if (
      input.side === 'SHORT' &&
      support != null &&
      last.close < support &&
      volumeOk
    ) {
      return 'BREAKOUT';
    }
  }

  // 4. Pullback retest — price within ~0.4% of EMA20 (or EMA50) and held.
  const emaTouchPct = 0.004;
  const ema = input.ema20 ?? input.ema50;
  if (ema != null && ema > 0) {
    const distance = Math.abs(last.close - ema) / ema;
    if (distance <= emaTouchPct) {
      if (input.side === 'LONG' && last.close >= ema && last.low <= ema * 1.005) {
        return 'PULLBACK_RETEST';
      }
      if (input.side === 'SHORT' && last.close <= ema && last.high >= ema * 0.995) {
        return 'PULLBACK_RETEST';
      }
    }
  }

  // 5. Trend continuation — clean trend regime, candle bias matches side.
  if (
    (input.side === 'LONG' && input.regime === 'BULLISH_TREND' && last.close >= last.open) ||
    (input.side === 'SHORT' && input.regime === 'BEARISH_TREND' && last.close <= last.open)
  ) {
    return 'TREND_CONTINUATION';
  }

  return 'NO_TRIGGER';
}
