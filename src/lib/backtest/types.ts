import type { Candle } from '@/types/chart';
import type {
  FuturesEntryTrigger,
  FuturesGrade,
  FuturesMarketRegimeId,
  FuturesSignalAction,
  FuturesSignalGrade,
  FuturesTradePermission,
} from '@/types/futures-signal';

/**
 * Backtest module — public types.
 *
 * The backtest is a deterministic, bar-by-bar simulator. It does NOT call the
 * live signal engine on its own; instead, callers precompute or supply
 * `BacktestSignal` snapshots and the simulator resolves their outcome from
 * candle data. This separation keeps the simulator dependency-free, easy to
 * fixture, and easy to unit-test.
 *
 * Vocabulary:
 *   - "trade" = an actionable signal (LONG/SHORT) that we attempted to take
 *   - "signal" = any engine output, including WAITs (WAITs raise wait-rate)
 *   - "R"     = stop-loss multiple. 1R = (entry-stop). PnL is reported in R.
 */

/**
 * A signal as the backtester sees it. The shape is intentionally smaller than
 * `FuturesSignal` so fixtures and historical replays don't need to fabricate
 * unrelated fields. All numeric prices are in the same quote currency as the
 * candles.
 */
export interface BacktestSignal {
  /** Index of the candle on which the signal was generated. */
  barIndex: number;
  symbol: string;
  timeframe: string;
  action: FuturesSignalAction;
  marketRegime: FuturesMarketRegimeId;
  tradePermission: FuturesTradePermission;
  setupType: FuturesEntryTrigger;
  /** 0..100 confidence reported by the engine (already cap-applied). */
  confidence: number;
  /** Coarse grade exposed by the strict pipeline. */
  grade: FuturesGrade;
  /** Engine's full A+/A/B/C/D grade. Optional — falls back to `grade`. */
  signalGrade?: FuturesSignalGrade;
  entry: number | null;
  stopLoss: number | null;
  tp1: number | null;
  tp2: number | null;
  tp3: number | null;
  /** R:R reported by the engine (to TP2). Stored for analytics only. */
  riskRewardRatio?: number | null;
}

/**
 * Per-trade fee/slippage model. All values are decimals (0.0004 = 4 bps).
 * Defaults are tuned to be conservative — better to underestimate edge than
 * overestimate it.
 */
export interface BacktestCosts {
  /** Per-side taker fee, decimal. e.g. 0.0004 = 0.04% (Binance Futures taker). */
  takerFee: number;
  /** Per-side slippage, decimal. e.g. 0.0005 = 5 bps. */
  slippage: number;
  /**
   * Funding cost placeholder, applied as an absolute fraction of notional once
   * per `fundingIntervalCandles` candles. Decimal (0.0001 = 1 bps).
   * Defaults to 0 — funding is realised at exchange-defined intervals; the
   * placeholder is here so future work can plug in real funding curves.
   */
  fundingCost?: number;
  /** Bars between funding events. Default: 8 hours of 30m candles = 16. */
  fundingIntervalCandles?: number;
}

/**
 * Simulation knobs. Defaults aim for "reasonable trader" behavior:
 *   - max hold = 48 candles (≈24h on 30m)
 *   - tp1 takes 1/3 of the position, tp2 takes another 1/3, tp3 closes
 *   - on a same-bar SL+TP touch, SL wins (worst-case assumption)
 */
export interface BacktestConfig {
  /** Max candles to hold before forced EXPIRED. */
  maxHoldCandles: number;
  /** Close-by-close vs intrabar resolution (high/low). Defaults to intrabar. */
  intrabarFills: boolean;
  /**
   * On a same-bar SL+TP touch, prefer SL (true) or TP (false). True is the
   * conservative default — we assume the worst plausible execution.
   */
  preferStopOnConflict: boolean;
  /** Costs applied per round-trip. */
  costs: BacktestCosts;
}

/**
 * The lifecycle of a single backtest trade.
 *
 *   PENDING — waiting for SL/TP/expiry
 *   TP1/TP2/TP3 — partial/full target reached
 *   SL — stop loss hit
 *   EXPIRED — held to maxHoldCandles without resolution
 */
export type BacktestTradeStatus =
  | 'PENDING'
  | 'TP1'
  | 'TP2'
  | 'TP3'
  | 'SL'
  | 'EXPIRED';

export interface BacktestTrade {
  id: string;
  signal: BacktestSignal;
  status: BacktestTradeStatus;
  /** Bar index where the trade was opened. */
  openBarIndex: number;
  /** Bar index where the trade was closed (TP/SL/expired). */
  closeBarIndex: number;
  /** Effective entry price after slippage. */
  entryFill: number;
  /** Effective exit price after slippage. */
  exitFill: number | null;
  /** Number of candles the trade was held. */
  heldBars: number;
  /** Realised R-multiple (positive = win, negative = loss). */
  finalR: number;
  /** Maximum favorable excursion in R. */
  mfeR: number;
  /** Maximum adverse excursion in R. */
  maeR: number;
  /** Total round-trip cost expressed in R. */
  costR: number;
  /** Returned reasons string from the source signal. */
  reasons: string[];
  /** Returned warnings string from the source signal. */
  warnings: string[];
}

export interface BacktestPerformanceBucket {
  count: number;
  wins: number;
  losses: number;
  /** Sum of finalR across the bucket. */
  totalR: number;
  /** Average finalR across the bucket. */
  averageR: number;
  winRate: number;
}

/**
 * Phase 2 spec — required metrics. All R values are in stop-loss-multiples
 * (1R = entry → stop distance). Keep names stable; UI binds to them.
 */
export interface BacktestMetrics {
  totalSignals: number;
  totalTrades: number;
  /** % of all signals that were WAIT. */
  waitRate: number;
  winRate: number;
  lossRate: number;
  averageR: number;
  /**
   * Per-trade expectancy in R: (winRate * avgWinR) + (lossRate * avgLossR).
   * Positive means the strategy is profitable on average.
   */
  expectancyR: number;
  /** Sum of winning R / |sum of losing R|. ≥ 1 means net positive. */
  profitFactor: number;
  /** Largest peak-to-trough cumulative-R drawdown. */
  maxDrawdownR: number;
  maxLosingStreak: number;
  averageHoldCandles: number;
  bestSetupType: FuturesEntryTrigger | null;
  worstSetupType: FuturesEntryTrigger | null;
  performanceByRegime: Record<string, BacktestPerformanceBucket>;
  performanceByTimeframe: Record<string, BacktestPerformanceBucket>;
  performanceBySymbol: Record<string, BacktestPerformanceBucket>;
}

export interface BacktestResult {
  trades: BacktestTrade[];
  metrics: BacktestMetrics;
  /** Sample-size warnings derived from the metrics. UI surfaces them as-is. */
  warnings: string[];
}

export interface BacktestRunInput {
  symbol: string;
  timeframe: string;
  candles: Candle[];
  signals: BacktestSignal[];
  config?: Partial<BacktestConfig>;
}

/** Default costs aligned with Binance Futures (USDⓈ-M perpetual taker). */
export const DEFAULT_BACKTEST_COSTS: BacktestCosts = {
  takerFee: 0.0004,
  slippage: 0.0005,
  fundingCost: 0,
  fundingIntervalCandles: 16,
};

export const DEFAULT_BACKTEST_CONFIG: BacktestConfig = {
  maxHoldCandles: 48,
  intrabarFills: true,
  preferStopOnConflict: true,
  costs: DEFAULT_BACKTEST_COSTS,
};
