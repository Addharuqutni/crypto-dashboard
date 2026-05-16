import type { FuturesOpenInterestBias, FuturesSignalAction } from '@/types/futures-signal';

/**
 * Open Interest Filter.
 *
 * Maps (price direction, OI direction) to a confirmation bias and applies
 * a small confidence adjustment. OI is a confirmation tool: it cannot create
 * a signal where there isn't one and cannot override the risk engine.
 *
 *   price up   + OI up   = BULLISH_CONTINUATION (real new money)
 *   price up   + OI down = SHORT_COVERING       (rally is squeeze, weaker)
 *   price down + OI up   = BEARISH_CONTINUATION (real new shorts)
 *   price down + OI down = LONG_LIQUIDATION     (capitulation, weaker continuation)
 */

export interface OiInputs {
  /** Recent price change in % (e.g. 0.5 means +0.5%). Sign carries direction. */
  priceChangePercent: number | null | undefined;
  /** Recent OI change in % (e.g. -1.2 means -1.2%). Sign carries direction. */
  oiChangePercent: number | null | undefined;
}

export interface OiFilterResult {
  bias: FuturesOpenInterestBias;
  scoreAdjustment: number;
  warnings: string[];
}

/** Smallest absolute % change to be considered a real movement. */
const MIN_MAGNITUDE = 0.05; // 0.05% — anything tinier is noise.

/**

 * Menjalankan logic apply open interest filter.

 * Dipakai untuk memisahkan tanggung jawab fungsi ini dari bagian aplikasi lain.

 */

export function applyOpenInterestFilter(
  action: FuturesSignalAction,
  inputs: OiInputs
): OiFilterResult {
  const { priceChangePercent, oiChangePercent } = inputs;

  if (
    priceChangePercent == null ||
    oiChangePercent == null ||
    !Number.isFinite(priceChangePercent) ||
    !Number.isFinite(oiChangePercent)
  ) {
    return { bias: 'UNAVAILABLE', scoreAdjustment: 0, warnings: [] };
  }

  // If either move is noise-level, treat as neutral.
  if (
    Math.abs(priceChangePercent) < MIN_MAGNITUDE ||
    Math.abs(oiChangePercent) < MIN_MAGNITUDE
  ) {
    return { bias: 'NEUTRAL', scoreAdjustment: 0, warnings: [] };
  }

  const priceUp = priceChangePercent > 0;
  const oiUp = oiChangePercent > 0;

  if (priceUp && oiUp) {
    return {
      bias: 'BULLISH_CONTINUATION',
      scoreAdjustment: action === 'LONG' ? 5 : action === 'SHORT' ? -3 : 0,
      warnings: [],
    };
  }
  if (priceUp && !oiUp) {
    return {
      bias: 'SHORT_COVERING',
      scoreAdjustment: action === 'LONG' ? -2 : 0,
      warnings:
        action === 'LONG'
          ? ['Rally appears driven by short covering. Continuation may be weaker.']
          : [],
    };
  }
  if (!priceUp && oiUp) {
    return {
      bias: 'BEARISH_CONTINUATION',
      scoreAdjustment: action === 'SHORT' ? 5 : action === 'LONG' ? -3 : 0,
      warnings: [],
    };
  }
  // !priceUp && !oiUp
  return {
    bias: 'LONG_LIQUIDATION',
    scoreAdjustment: action === 'SHORT' ? -2 : 0,
    warnings:
      action === 'SHORT'
        ? ['Down move looks like long liquidation. Continuation may be weaker.']
        : [],
  };
}
