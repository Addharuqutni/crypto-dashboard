import type { Candle } from '@/types/chart';
import type { FuturesLiquiditySweep, FuturesLiquiditySweepType } from '@/types/futures-signal';

/**
 * Liquidity Sweep Detector.
 *
 * Identifies stop-hunt patterns where the most recent candle pierces a
 * recent swing high/low and then *reclaims* (closes back inside the prior
 * range). Volume spike further increases confidence.
 *
 * Bullish sweep: prints a low below recent swing low, closes above it.
 * Bearish sweep: prints a high above recent swing high, closes below it.
 *
 * This is a TRIGGER, not a guarantee. The futures engine still requires
 * regime/MTF/risk confirmation before acting on it.
 */

export interface SweepDetectorOptions {
  /** How many bars back to look for the swing reference. */
  lookback?: number;
  /** Minimum wick size relative to candle body to consider a sweep. */
  minWickRatio?: number;
  /** Volume ratio (vs recent average) above which a volume spike is "strong". */
  volumeSpikeRatio?: number;
}

const DEFAULTS: Required<SweepDetectorOptions> = {
  lookback: 20,
  minWickRatio: 1.0,
  volumeSpikeRatio: 1.5,
};

/**
 * Detect a liquidity sweep on the most recent candle.
 *
 * Returns `{ type: 'NONE', sweptLevel: null, confidence: 0 }` when no clean
 * sweep is found. Confidence is 0..100 driven by:
 *   - reclaim quality (close vs swept level)
 *   - wick depth beyond the swept level
 *   - volume spike on the sweep bar
 */
export function detectLiquiditySweep(
  candles: Candle[],
  options: SweepDetectorOptions = {}
): FuturesLiquiditySweep {
  const opts = { ...DEFAULTS, ...options };

  if (candles.length < opts.lookback + 2) {
    return { type: 'NONE', sweptLevel: null, confidence: 0 };
  }

  const last = candles[candles.length - 1];
  if (!last) return { type: 'NONE', sweptLevel: null, confidence: 0 };

  // Reference window — exclude the current candle.
  const reference = candles.slice(-opts.lookback - 1, -1);
  if (reference.length === 0) {
    return { type: 'NONE', sweptLevel: null, confidence: 0 };
  }

  let swingHigh = -Infinity;
  let swingLow = Infinity;
  let volumeSum = 0;
  for (const c of reference) {
    if (c.high > swingHigh) swingHigh = c.high;
    if (c.low < swingLow) swingLow = c.low;
    volumeSum += c.volume;
  }
  const avgVolume = volumeSum / reference.length;

  const body = Math.abs(last.close - last.open);
  const upperWick = last.high - Math.max(last.open, last.close);
  const lowerWick = Math.min(last.open, last.close) - last.low;
  const volumeRatio = avgVolume > 0 ? last.volume / avgVolume : 1;

  // --- Bullish sweep: pierced below swing low, reclaimed above. ---
  if (last.low < swingLow && last.close > swingLow) {
    const wickDepth = swingLow - last.low;
    const wickRatio = body > 0 ? lowerWick / body : 2;

    if (wickRatio >= opts.minWickRatio || wickDepth > 0) {
      return {
        type: 'BULLISH_SWEEP',
        sweptLevel: swingLow,
        confidence: scoreSweep({
          reclaimDistance: last.close - swingLow,
          referenceLevel: swingLow,
          wickDepth,
          wickRatio,
          volumeRatio,
          volumeSpikeRatio: opts.volumeSpikeRatio,
        }),
      };
    }
  }

  // --- Bearish sweep: pierced above swing high, reclaimed below. ---
  if (last.high > swingHigh && last.close < swingHigh) {
    const wickDepth = last.high - swingHigh;
    const wickRatio = body > 0 ? upperWick / body : 2;

    if (wickRatio >= opts.minWickRatio || wickDepth > 0) {
      return {
        type: 'BEARISH_SWEEP',
        sweptLevel: swingHigh,
        confidence: scoreSweep({
          reclaimDistance: swingHigh - last.close,
          referenceLevel: swingHigh,
          wickDepth,
          wickRatio,
          volumeRatio,
          volumeSpikeRatio: opts.volumeSpikeRatio,
        }),
      };
    }
  }

  return { type: 'NONE', sweptLevel: null, confidence: 0 };
}

interface ScoreInputs {
  reclaimDistance: number;
  referenceLevel: number;
  wickDepth: number;
  wickRatio: number;
  volumeRatio: number;
  volumeSpikeRatio: number;
}

/**

 * Menjalankan logic score sweep.

 * Dipakai untuk memisahkan tanggung jawab fungsi ini dari bagian aplikasi lain.

 */

function scoreSweep(s: ScoreInputs): number {
  if (s.referenceLevel <= 0) return 0;

  // Reclaim quality: close back inside the range, scaled by % of reference.
  const reclaimPct = s.reclaimDistance / s.referenceLevel;
  const reclaimScore = clamp(reclaimPct * 4000, 0, 40); // ~1% reclaim -> ~40pts

  // Wick depth past the swept level — too shallow is suspect.
  const wickPct = s.wickDepth / s.referenceLevel;
  const wickScore = clamp(wickPct * 4000, 0, 30); // ~0.75% wick -> ~30pts

  // Wick-to-body ratio: long wicks indicate rejection.
  const ratioScore = clamp((s.wickRatio - 1) * 10, 0, 15);

  // Volume spike contribution.
  const volumeScore = s.volumeRatio >= s.volumeSpikeRatio ? 15 : s.volumeRatio >= 1 ? 5 : 0;

  const total = reclaimScore + wickScore + ratioScore + volumeScore;
  return clamp(Math.round(total), 0, 100);
}

/**

 * Menjalankan logic clamp.

 * Dipakai untuk memisahkan tanggung jawab fungsi ini dari bagian aplikasi lain.

 */

function clamp(v: number, min: number, max: number): number {
  if (!Number.isFinite(v)) return min;
  return Math.max(min, Math.min(max, v));
}

/** Convenience type re-export so callers can ignore internal details. */
export type { FuturesLiquiditySweepType };
