import type {
  FuturesEntryTrigger,
  FuturesMarketRegimeId,
  FuturesSignal,
  FuturesSignalAction,
  FuturesTradePermission,
} from './futures-signal';

/**
 * Phase 4 — intelligence layer types.
 *
 * The "intelligence layer" is a strictly deterministic stack of pure
 * functions that summarise market context, rank setups, and explain
 * `WAIT` outcomes. AI never enters this stack — it is explained BY it.
 *
 * Vocabulary:
 *   - MarketContext: a single snapshot derived from BTC 4H + funding + OI +
 *     volatility data. Fed into the UI dashboard and the AI auditor.
 *   - SetupRanking: a 0-100 quality score with per-dimension breakdown.
 *   - RiskProfile: user-selected discipline preset that adjusts thresholds.
 */

/**
 * Market-wide funding regime. Crowding is measured as the deviation from a
 * neutral funding band (±0.005% for Binance USDⓈ-M). Positive deviation =
 * longs paying shorts (crowded long); negative = shorts paying longs.
 */
export type FundingRegime = 'neutral' | 'crowded_long' | 'crowded_short';

/**
 * Open-interest regime. Computed against a 24h baseline:
 *   - 'rising'   — OI ≥ +5% vs 24h
 *   - 'falling'  — OI ≤ -5% vs 24h
 *   - 'abnormal' — |Δ| ≥ 25% in 24h (de-leveraging or squeeze risk)
 *   - 'stable'   — within ±5%
 */
export type OpenInterestRegime = 'rising' | 'falling' | 'abnormal' | 'stable';

/** Volatility class derived from the setup TF ATR / price ratio. */
export type VolatilityRegime = 'low' | 'normal' | 'high' | 'extreme';

/**
 * Aggregated risk mode. The dashboard uses this to decide whether to allow
 * trading. `no_trade` overrides everything below it; `caution` reduces the
 * default position-size multiplier; `normal` is the only mode where the
 * worker is allowed to fire directional alerts at full confidence.
 */
export type MarketRiskMode = 'normal' | 'caution' | 'no_trade';

/**
 * One-shot snapshot used by both the UI dashboard and the AI auditor.
 *
 * Every field is either a computed primitive or a short, human-readable
 * label. Numbers are rounded at construction time so consumers don't need
 * to re-format them.
 */
export interface MarketContext {
  /** Epoch ms when the snapshot was built. */
  generatedAt: number;
  /** Always `BTCUSDT` for now; future versions may track a basket. */
  reference: string;

  /** Canonical 4H regime as decided by the Phase 1 regime engine. */
  btc4hRegime: FuturesMarketRegimeId;
  /** Trade permission inherited from the 4H regime gate. */
  tradePermission: FuturesTradePermission;
  /** 15m / 30m trigger TF bias label. */
  triggerBias: 'bullish' | 'bearish' | 'neutral';

  /** ETH↔BTC correlation regime (`high` ≥ 0.8, `medium` 0.5-0.8, `low` < 0.5). */
  ethCorrelation: 'high' | 'medium' | 'low' | 'unknown';

  funding: {
    regime: FundingRegime;
    /** Most recent observed rate (decimal). Null when unavailable. */
    rate: number | null;
    /** Hours since last refresh; used for staleness checks. */
    ageHours: number | null;
  };

  openInterest: {
    regime: OpenInterestRegime;
    /** Percent change vs 24h. Null when unavailable. */
    change24hPct: number | null;
    ageMinutes: number | null;
  };

  volatility: {
    regime: VolatilityRegime;
    /** ATR / price as a decimal, e.g. 0.012 = 1.2%. */
    atrToPrice: number | null;
  };

  riskMode: MarketRiskMode;

  /** Short, ordered list of human-readable reasons describing the snapshot. */
  reasons: string[];
  /** Sample-size / data-staleness warnings. */
  warnings: string[];
}

/**
 * Per-dimension score breakdown. Each value is 0-100. The composite ranking
 * is a weighted average; see `setup-ranking.ts` for the weights.
 */
export interface SetupRankingBreakdown {
  regimeAlignment: number;
  triggerQuality: number;
  riskReward: number;
  dataHealth: number;
  volatility: number;
  journalHistory: number;
}

export type SetupGrade = 'A+' | 'A' | 'B' | 'C' | 'D' | 'F';

export interface SetupRanking {
  /** Composite 0-100 score. */
  score: number;
  /** Letter grade derived from `score`. */
  grade: SetupGrade;
  breakdown: SetupRankingBreakdown;
  /** Human-readable reasons explaining the dominant scoring factors. */
  reasons: string[];
}

/** User-selected discipline preset. */
export type RiskProfileId =
  | 'conservative'
  | 'balanced'
  | 'aggressive'
  | 'scalper'
  | 'swing';

export interface RiskProfile {
  id: RiskProfileId;
  /** Human-readable label rendered in the UI. */
  label: string;
  /** Short description of the trade-offs. */
  description: string;
  /** Minimum confidence (0-100) needed to consider a directional alert. */
  minConfidence: number;
  /** Minimum risk:reward to TP2 needed to consider the setup. */
  minRiskReward: number;
  /** Hard ceiling on suggested leverage. */
  maxLeverage: number;
  /** Whether countertrend setups (e.g. SHORT in bullish regime) are allowed. */
  allowCountertrend: boolean;
  /**
   * Cooldown multiplier applied on top of the worker's default. Higher =
   * fewer alerts. Used to express discipline "tightness".
   */
  cooldownMultiplier: number;
}

/**
 * Structured input for the AI Signal Auditor. Every field is grounded in
 * deterministic engine output — the auditor MUST NOT introduce new prices.
 */
export interface AiAuditorInput {
  symbol: string;
  setupTimeframe: string;
  macroTimeframe: string;
  triggerTimeframe: string;
  signal: FuturesSignal;
  marketContext: MarketContext;
  ranking: SetupRanking;
  riskProfile: RiskProfileId;
  /**
   * Aggregated journal stats for this (symbol, action). Optional — the
   * auditor must explicitly note when stats are unavailable rather than
   * assume favorable historicals.
   */
  journalStats?: {
    sampleSize: number;
    winRate: number;
    averageR: number;
  };
}

/**
 * Structured output the AI auditor must produce. Free-form prose is wrapped
 * by these named slots so the UI can render them safely without trusting
 * the LLM to follow a particular layout.
 */
export interface AiAuditorReport {
  consistent: boolean;
  consistencyExplanation: string;
  bestArgumentFor: string;
  bestArgumentAgainst: string;
  invalidationCondition: string;
  shouldWait: boolean;
  shouldWaitReason: string;
  /** Optional caveats; surfaced as warnings. */
  caveats: string[];
  /** True if the AI tried to emit prices/levels not in the deterministic plan. */
  detectedPriceFabrication: boolean;
  /** Conflict between AI verdict and deterministic action, if any. */
  conflict?: {
    aiAction: FuturesSignalAction;
    deterministicAction: FuturesSignalAction;
    note: string;
  };
}

/** Output from the no-trade intelligence module. */
export interface NoTradeExplanation {
  /** Primary reason category. */
  category: 'data' | 'structure' | 'volatility' | 'risk_reward' | 'permission' | 'unknown';
  /** Short headline. */
  headline: string;
  /** Detailed explanation. */
  detail: string;
  /** Concrete condition that must change to make a setup actionable. */
  conditionToChange: string;
  /** Specific level/trigger to watch (when applicable). Null when not relevant. */
  levelToWatch: string | null;
  /** Suggested timeframe for re-evaluation. */
  reevaluateInMinutes: number;
}

/** Convenience export for downstream consumers. */
export type { FuturesEntryTrigger };
