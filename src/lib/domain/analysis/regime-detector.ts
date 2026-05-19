import type { Candle } from '@/types/chart';
import type { FuturesMarketRegime, FuturesSignalConfig } from '@/types/futures-signal';
import { DEFAULT_FUTURES_SIGNAL_CONFIG } from '@/types/futures-signal';
import { calculateLatestEMAFromCandles } from '@/lib/domain/indicators/ema';
import { calculateLatestATR } from '@/lib/domain/indicators/atr';
import { calculateLatestADX } from '@/lib/domain/indicators/adx';

/**
 * Regime detector.
 *
 * Classifies the current market into:
 *   - BULLISH_TREND: aligned EMAs above 200, ADX confirms, normal volatility
 *   - BEARISH_TREND: mirror image of bullish
 *   - RANGE: weak ADX, normal volatility, mixed EMAs
 *   - CHOP_HIGH_RISK: extreme volatility OR conflicting trend signals
 *   - INSUFFICIENT_DATA: missing critical inputs (EMA200, ADX, ATR)
 *
 * Returning `INSUFFICIENT_DATA` is preferred over silently picking a regime —
 * downstream risk logic must be able to refuse to act when context is missing.
 */

export interface RegimeContext {
  regime: FuturesMarketRegime;
  ema20: number | null;
  ema50: number | null;
  ema200: number | null;
  adx: number | null;
  plusDi: number | null;
  minusDi: number | null;
  atr: number | null;
  /** ATR / price — relative volatility, useful as a sizing input. */
  atrPctOfPrice: number | null;
  reason: string;
}

/**

 * Menjalankan logic detect regime.

 * Dipakai untuk memisahkan tanggung jawab fungsi ini dari bagian aplikasi lain.

 */

export function detectRegime(
  candles: Candle[],
  config: FuturesSignalConfig = DEFAULT_FUTURES_SIGNAL_CONFIG
): RegimeContext {
  // Need enough candles for EMA200 and ADX. ADX needs 2*period+1 bars.
  const minRequired = Math.max(config.emaLongPeriod, 2 * config.adxPeriod + 1);
  const last = candles[candles.length - 1];
  const price = last?.close ?? null;

  if (candles.length < minRequired || price == null) {
    return {
      regime: 'INSUFFICIENT_DATA',
      ema20: null,
      ema50: null,
      ema200: null,
      adx: null,
      plusDi: null,
      minusDi: null,
      atr: null,
      atrPctOfPrice: null,
      reason: `Need at least ${minRequired} candles for stable EMA200 and ADX${config.adxPeriod}.`,
    };
  }

  const ema20 = calculateLatestEMAFromCandles(candles, config.emaShortPeriod);
  const ema50 = calculateLatestEMAFromCandles(candles, config.emaMidPeriod);
  const ema200 = calculateLatestEMAFromCandles(candles, config.emaLongPeriod);
  const atr = calculateLatestATR(candles, config.atrPeriod);
  const adxResult = calculateLatestADX(candles, config.adxPeriod);

  if (ema20 == null || ema50 == null || ema200 == null || atr == null || !adxResult) {
    return {
      regime: 'INSUFFICIENT_DATA',
      ema20,
      ema50,
      ema200,
      adx: adxResult?.adx ?? null,
      plusDi: adxResult?.plusDi ?? null,
      minusDi: adxResult?.minusDi ?? null,
      atr,
      atrPctOfPrice: null,
      reason: 'One or more required indicators returned null.',
    };
  }

  const atrPctOfPrice = price > 0 ? atr / price : null;
  const isExtremeVol =
    atrPctOfPrice != null && atrPctOfPrice >= config.extremeVolatilityRatio;
  const isAdxTrending = adxResult.adx >= config.adxTrendThreshold;
  const isAdxWeak = adxResult.adx <= config.adxWeakThreshold;

  // Strongly aligned EMAs: short > mid > price > long arrangement.
  const bullishStack = price > ema200 && ema20 > ema50;
  const bearishStack = price < ema200 && ema20 < ema50;
  const diBull = adxResult.plusDi > adxResult.minusDi;
  const diBear = adxResult.minusDi > adxResult.plusDi;

  const ctxBase = {
    ema20,
    ema50,
    ema200,
    adx: adxResult.adx,
    plusDi: adxResult.plusDi,
    minusDi: adxResult.minusDi,
    atr,
    atrPctOfPrice,
  };

  if (isExtremeVol) {
    return {
      ...ctxBase,
      regime: 'CHOP_HIGH_RISK',
      reason: `Extreme volatility: ATR is ${(atrPctOfPrice! * 100).toFixed(2)}% of price.`,
    };
  }

  if (bullishStack && isAdxTrending && diBull) {
    return {
      ...ctxBase,
      regime: 'BULLISH_TREND',
      reason: `Bullish stack with ADX ${adxResult.adx.toFixed(1)} and +DI dominance.`,
    };
  }

  if (bearishStack && isAdxTrending && diBear) {
    return {
      ...ctxBase,
      regime: 'BEARISH_TREND',
      reason: `Bearish stack with ADX ${adxResult.adx.toFixed(1)} and -DI dominance.`,
    };
  }

  if (isAdxWeak && !bullishStack && !bearishStack) {
    return {
      ...ctxBase,
      regime: 'RANGE',
      reason: `Weak ADX ${adxResult.adx.toFixed(1)} with mixed EMA alignment.`,
    };
  }

  // Trend signals are inconsistent: trending ADX but no clean stack, or
  // stacked EMAs with weak ADX. Treat as chop / high risk.
  return {
    ...ctxBase,
    regime: 'CHOP_HIGH_RISK',
    reason: 'Trend signals are conflicting between EMA alignment and ADX direction.',
  };
}
