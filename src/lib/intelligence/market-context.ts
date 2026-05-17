import type {
  FundingRegime,
  MarketContext,
  MarketRiskMode,
  OpenInterestRegime,
  VolatilityRegime,
} from '@/types/intelligence';
import type { Candle } from '@/types/chart';
import type {
  FuturesMarketRegimeId,
  FuturesTradePermission,
} from '@/types/futures-signal';
import { calculateATR } from '@/lib/indicators/atr';

/**
 * Phase 4 — Market Context Engine.
 *
 * Builds a deterministic snapshot of BTC-anchored market state. Every input
 * is optional; missing data is acknowledged in `warnings` rather than
 * silently substituted. The engine never invents numbers.
 *
 * Why BTC-anchored: in a multi-asset crypto world the dominant correlation
 * lives at the BTC level, so any "market regime" answer that ignores BTC is
 * a noise trap. The Phase 1 4H regime is the source of truth — this module
 * just enriches it with funding/OI/volatility/correlation context.
 */

export interface BuildMarketContextInput {
  /** BTC 4H regime as decided by the Phase 1 regime engine. */
  btc4hRegime: FuturesMarketRegimeId;
  /** Trade permission inherited from the 4H regime gate. */
  tradePermission: FuturesTradePermission;
  /** Recent BTC setup-TF candles, used for the trigger bias and ATR. */
  btcSetupCandles?: Candle[];
  /** Recent ETH setup-TF candles for correlation. Same length as BTC ideally. */
  ethSetupCandles?: Candle[];
  /** Latest funding rate snapshot. */
  funding?: {
    rate: number;
    /** Epoch ms when this rate was observed. */
    observedAt: number;
  };
  /** Latest OI snapshot vs 24h baseline. */
  openInterest?: {
    /** Most recent OI in contracts/quote (whatever Binance exposes). */
    current: number;
    /** OI ~24h ago for the same contract. */
    baseline: number;
    observedAt: number;
  };
  /** Reference epoch ms; defaults to `Date.now()`. */
  nowMs?: number;
}

const FUNDING_NEUTRAL_BAND = 0.00005; // 0.005%
const OI_RISING_THRESHOLD = 5;        // %
const OI_ABNORMAL_THRESHOLD = 25;     // %
const VOL_LOW_RATIO = 0.005;          // ATR/price ≤ 0.5%
const VOL_HIGH_RATIO = 0.018;         // ATR/price ≥ 1.8%
const VOL_EXTREME_RATIO = 0.03;       // ATR/price ≥ 3.0%
const FUNDING_STALE_HOURS = 9;        // funding settles every 8h
const OI_STALE_MINUTES = 15;

/**
 * Build a snapshot. Pure: same inputs → same outputs. Use the worker or a
 * client-side hook to refresh on a cadence.
 */
export function buildMarketContext(input: BuildMarketContextInput): MarketContext {
  const now = input.nowMs ?? Date.now();
  const reasons: string[] = [];
  const warnings: string[] = [];

  // --- volatility ---
  const setup = input.btcSetupCandles ?? [];
  let atrToPrice: number | null = null;
  let volatilityRegime: VolatilityRegime = 'normal';
  if (setup.length >= 30) {
    const atrSeries = calculateATR(setup, 14);
    const atr = atrSeries && atrSeries.length > 0 ? atrSeries[atrSeries.length - 1] : null;
    const last = setup[setup.length - 1];
    if (atr != null && Number.isFinite(atr) && last && last.close > 0) {
      atrToPrice = atr / last.close;
      volatilityRegime = classifyVolatility(atrToPrice);
      reasons.push(
        `ATR/price ${(atrToPrice * 100).toFixed(2)}% → ${volatilityRegime} volatility.`
      );
    }
  } else {
    warnings.push('Volatility: insufficient candles for ATR (need ≥30).');
  }

  // --- funding ---
  let fundingRegime: FundingRegime = 'neutral';
  let fundingRate: number | null = null;
  let fundingAgeHours: number | null = null;
  if (input.funding) {
    fundingRate = input.funding.rate;
    fundingAgeHours = (now - input.funding.observedAt) / 3_600_000;
    fundingRegime = classifyFunding(fundingRate);
    if (fundingAgeHours > FUNDING_STALE_HOURS) {
      warnings.push(`Funding stale (${fundingAgeHours.toFixed(1)}h since refresh).`);
    } else {
      reasons.push(
        `Funding rate ${(fundingRate * 100).toFixed(4)}% → ${fundingRegime.replace(/_/g, ' ')}.`
      );
    }
  } else {
    warnings.push('Funding rate unavailable.');
  }

  // --- open interest ---
  let oiRegime: OpenInterestRegime = 'stable';
  let oiChangePct: number | null = null;
  let oiAgeMinutes: number | null = null;
  if (input.openInterest && input.openInterest.baseline > 0) {
    oiChangePct =
      ((input.openInterest.current - input.openInterest.baseline) / input.openInterest.baseline) *
      100;
    oiRegime = classifyOpenInterest(oiChangePct);
    oiAgeMinutes = (now - input.openInterest.observedAt) / 60_000;
    if (oiAgeMinutes > OI_STALE_MINUTES) {
      warnings.push(`Open interest stale (${oiAgeMinutes.toFixed(0)}m since refresh).`);
    } else {
      reasons.push(`Open interest ${oiChangePct >= 0 ? '+' : ''}${oiChangePct.toFixed(1)}% → ${oiRegime}.`);
    }
  } else {
    warnings.push('Open interest unavailable.');
  }

  // --- ETH correlation ---
  const ethCorrelation = correlationLabel(input.btcSetupCandles, input.ethSetupCandles);
  if (ethCorrelation === 'unknown') {
    warnings.push('ETH/BTC correlation unavailable (insufficient ETH candles).');
  } else {
    reasons.push(`ETH↔BTC correlation: ${ethCorrelation}.`);
  }

  // --- trigger bias ---
  const triggerBias = triggerBiasFromCandles(setup);

  // --- risk mode ---
  const riskMode = decideRiskMode({
    btc4hRegime: input.btc4hRegime,
    tradePermission: input.tradePermission,
    volatilityRegime,
    oiRegime,
    fundingRegime,
    dataIncomplete: warnings.length > 0,
  });

  if (riskMode === 'no_trade') {
    reasons.push('Aggregated risk mode: NO TRADE.');
  } else if (riskMode === 'caution') {
    reasons.push('Aggregated risk mode: caution. Reduce size or stand aside.');
  }

  return {
    generatedAt: now,
    reference: 'BTCUSDT',
    btc4hRegime: input.btc4hRegime,
    tradePermission: input.tradePermission,
    triggerBias,
    ethCorrelation,
    funding: {
      regime: fundingRegime,
      rate: fundingRate,
      ageHours: fundingAgeHours,
    },
    openInterest: {
      regime: oiRegime,
      change24hPct: oiChangePct,
      ageMinutes: oiAgeMinutes,
    },
    volatility: {
      regime: volatilityRegime,
      atrToPrice,
    },
    riskMode,
    reasons,
    warnings,
  };
}

/** Coarse trigger bias from the most recent N closes. */
function triggerBiasFromCandles(candles: Candle[]): MarketContext['triggerBias'] {
  if (candles.length < 20) return 'neutral';
  const recent = candles.slice(-20);
  const start = recent[0]?.close ?? null;
  const end = recent[recent.length - 1]?.close ?? null;
  if (start == null || end == null || start <= 0) return 'neutral';
  const moveBp = ((end - start) / start) * 10_000;
  if (moveBp >= 30) return 'bullish';
  if (moveBp <= -30) return 'bearish';
  return 'neutral';
}

function classifyVolatility(atrToPrice: number): VolatilityRegime {
  if (atrToPrice <= VOL_LOW_RATIO) return 'low';
  if (atrToPrice <= VOL_HIGH_RATIO) return 'normal';
  if (atrToPrice <= VOL_EXTREME_RATIO) return 'high';
  return 'extreme';
}

function classifyFunding(rate: number): FundingRegime {
  if (rate > FUNDING_NEUTRAL_BAND) return 'crowded_long';
  if (rate < -FUNDING_NEUTRAL_BAND) return 'crowded_short';
  return 'neutral';
}

function classifyOpenInterest(changePct: number): OpenInterestRegime {
  if (Math.abs(changePct) >= OI_ABNORMAL_THRESHOLD) return 'abnormal';
  if (changePct >= OI_RISING_THRESHOLD) return 'rising';
  if (changePct <= -OI_RISING_THRESHOLD) return 'falling';
  return 'stable';
}

/**
 * ETH↔BTC correlation label. Pearson correlation on the last 60 closes when
 * both series have enough data. The value→label thresholds are intentionally
 * coarse: this is a context indicator, not a hedging signal.
 */
function correlationLabel(
  btc: Candle[] | undefined,
  eth: Candle[] | undefined
): MarketContext['ethCorrelation'] {
  if (!btc || !eth) return 'unknown';
  const n = Math.min(btc.length, eth.length);
  if (n < 30) return 'unknown';
  const a = btc.slice(-n).map((c) => c.close);
  const b = eth.slice(-n).map((c) => c.close);
  const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;
  const ma = mean(a);
  const mb = mean(b);
  let num = 0;
  let dA = 0;
  let dB = 0;
  for (let i = 0; i < n; i++) {
    const av = (a[i] ?? ma) - ma;
    const bv = (b[i] ?? mb) - mb;
    num += av * bv;
    dA += av * av;
    dB += bv * bv;
  }
  const denom = Math.sqrt(dA * dB);
  if (denom === 0) return 'unknown';
  const r = num / denom;
  if (r >= 0.8) return 'high';
  if (r >= 0.5) return 'medium';
  return 'low';
}

/**
 * Aggregate risk mode. Order is conservative: any one fatal flag escalates
 * the aggregate to the next level even if the others are fine.
 */
function decideRiskMode(args: {
  btc4hRegime: FuturesMarketRegimeId;
  tradePermission: FuturesTradePermission;
  volatilityRegime: VolatilityRegime;
  oiRegime: OpenInterestRegime;
  fundingRegime: FundingRegime;
  dataIncomplete: boolean;
}): MarketRiskMode {
  if (args.tradePermission === 'no_trade') return 'no_trade';
  if (args.btc4hRegime === 'choppy' || args.btc4hRegime === 'volatile') return 'no_trade';
  if (args.volatilityRegime === 'extreme') return 'no_trade';
  if (args.oiRegime === 'abnormal') return 'caution';
  if (args.volatilityRegime === 'high') return 'caution';
  if (args.fundingRegime !== 'neutral') return 'caution';
  if (args.dataIncomplete) return 'caution';
  return 'normal';
}
