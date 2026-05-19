import type { Candle } from '@/types/chart';

/**
 * Deterministic candle fixtures used by both the unit tests and the
 * `/backtest` UI demo. Producing them programmatically keeps the simulator
 * decoupled from live Binance data and makes failures reproducible.
 *
 * All five canonical regimes covered by Phase 1 are represented:
 *   - bullish trend
 *   - bearish trend
 *   - range
 *   - choppy
 *   - volatile
 *
 * Times are anchored against an arbitrary, stable epoch so freshness checks
 * elsewhere in the codebase don't need to mock `Date.now`.
 */

const BASE_TIME = 1_700_000_000_000; // 2023-11-14T22:13:20Z — fixed
const THIRTY_MIN = 30 * 60 * 1000;

/** Internal pseudo-RNG so noise is identical across runs. */
function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface SeriesOpts {
  count: number;
  startPrice: number;
  /** Per-bar drift, decimal. 0.001 = +0.1%/bar. */
  drift: number;
  /** Per-bar noise stddev, decimal. */
  noise: number;
  /** Multiplier on the high/low spread. 1 ≈ ~0.1% wicks. */
  rangeMult?: number;
  intervalMs?: number;
  endCloseMs?: number;
  symbol?: string;
  binanceSymbol?: string;
  baseVolume?: number;
  seed?: number;
}

/**
 * Produce a deterministic OHLCV series. Open[0] = startPrice; each bar's open
 * equals the previous bar's close so the chart stays continuous.
 */
function makeSeries(opts: SeriesOpts): Candle[] {
  const interval = opts.intervalMs ?? THIRTY_MIN;
  const endClose = opts.endCloseMs ?? BASE_TIME + opts.count * interval;
  const startClose = endClose - (opts.count - 1) * interval;
  const symbol = opts.symbol ?? 'BTC';
  const binance = opts.binanceSymbol ?? 'BTCUSDT';
  const rng = mulberry32(opts.seed ?? 1);
  const rangeMult = opts.rangeMult ?? 1;
  const baseVol = opts.baseVolume ?? 1000;

  const out: Candle[] = [];
  let price = opts.startPrice;
  for (let i = 0; i < opts.count; i++) {
    const open = price;
    const noiseShock = (rng() - 0.5) * 2 * opts.noise;
    const close = open * (1 + opts.drift + noiseShock);
    const lo = Math.min(open, close);
    const hi = Math.max(open, close);
    const wick = open * 0.001 * rangeMult * (1 + rng());
    const high = hi + wick;
    const low = Math.max(0, lo - wick);
    const closeTime = startClose + i * interval;
    const openTime = closeTime - interval;
    out.push({
      symbol,
      binanceSymbol: binance,
      openTime,
      open,
      high,
      low,
      close,
      volume: baseVol * (0.8 + rng() * 0.6),
      closeTime,
    });
    price = close;
  }
  return out;
}

/**
 * Bullish trending market: positive drift, small noise. EMA stack should
 * resolve as fast > mid > slow over the second half of the series.
 */
export function bullishTrendFixture(count = 240): Candle[] {
  return makeSeries({
    count,
    startPrice: 100,
    drift: 0.0015,
    noise: 0.0008,
    rangeMult: 1,
    seed: 1,
  });
}

/** Bearish trending market — mirror image of bullishTrendFixture. */
export function bearishTrendFixture(count = 240): Candle[] {
  return makeSeries({
    count,
    startPrice: 200,
    drift: -0.0015,
    noise: 0.0008,
    rangeMult: 1,
    seed: 2,
  });
}

/** Range market: zero drift, moderate noise, tight wicks. */
export function rangeFixture(count = 240): Candle[] {
  return makeSeries({
    count,
    startPrice: 150,
    drift: 0,
    noise: 0.0035,
    rangeMult: 1,
    seed: 3,
  });
}

/**
 * Choppy market: zero drift, large noise, wide wicks. Designed to look like a
 * market the engine should refuse to trade.
 */
export function choppyFixture(count = 240): Candle[] {
  return makeSeries({
    count,
    startPrice: 150,
    drift: 0,
    noise: 0.008,
    rangeMult: 3,
    seed: 4,
  });
}

/**
 * Volatile market: small drift, very large noise. ATR/price ratio sits high
 * enough that the engine's risk gate should reject most setups.
 */
export function volatileFixture(count = 240): Candle[] {
  return makeSeries({
    count,
    startPrice: 150,
    drift: 0.0005,
    noise: 0.02,
    rangeMult: 5,
    seed: 5,
  });
}

/** All canonical regimes, keyed by name, for parametric tests + UI demos. */
export const FIXTURES = {
  bullish_trend: bullishTrendFixture,
  bearish_trend: bearishTrendFixture,
  range: rangeFixture,
  choppy: choppyFixture,
  volatile: volatileFixture,
} as const;

export type FixtureName = keyof typeof FIXTURES;
