import type {
  FuturesDataHealth,
  FuturesGrade,
  FuturesMarketRegimeId,
  FuturesSignalAction,
  FuturesTradePermission,
} from '@/types/futures-signal';
import type { BinanceInterval } from '@/lib/adapters/binance/intervals';

export type ScreenerRunStatus = 'idle' | 'running' | 'completed' | 'completed_with_errors' | 'failed';

export interface ScreenerAlertSettings {
  enabled: boolean;
  minConfidence: number;
  minGrade: FuturesGrade;
  minRiskReward: number;
  maxAlertsPerHour: number;
  cooldownMinutes: number;
  sendWaitAlerts: boolean;
  topNOnly: number;
}

export interface ScreenerConfig {
  symbols: ScreenerUniverseCoin[];
  setupTimeframe: BinanceInterval;
  triggerTimeframe: BinanceInterval;
  macroTimeframe: BinanceInterval;
  intervalMinutes: number;
  maxConcurrentSymbols: number;
  candleLimit: number;
  alertSettings: ScreenerAlertSettings;
}

export interface ScreenerUniverseCoin {
  symbol: string;
  baseAsset: string;
  quoteAsset: string;
  marketCapRank?: number;
}

export interface ScreenerHealth {
  status: ScreenerRunStatus;
  startedAt: number | null;
  completedAt: number | null;
  evaluatedSymbols: number;
  failedSymbols: number;
  errors: Array<{ symbol: string; message: string }>;
}

/**
 * Local alert status for screener dashboard events.
 *
 * There is no external delivery in the screener — all alerts are local
 * dashboard events only. Status semantics:
 *   - triggered:              alert passed all policy gates and is active
 *   - skipped:                neutral no-op (e.g. WAIT disabled, below threshold)
 *   - suppressed_cooldown:    blocked by cooldown window (no material change)
 *   - suppressed_hourly_cap:  blocked by hourly alert budget
 *   - suppressed_low_quality: blocked by data health or quality gate
 *   - expired:                alert aged out without action
 */
export type ScreenerAlertStatus =
  | 'triggered'
  | 'skipped'
  | 'suppressed_cooldown'
  | 'suppressed_hourly_cap'
  | 'suppressed_low_quality'
  | 'expired';

/**
 * Freshness metadata for each data source used in the screener evaluation.
 * Allows the UI to show degraded context when data is stale or unavailable.
 */
export interface ScreenerFreshnessMetadata {
  /** Seconds since last setup candle close. Null when unknown. */
  setupCandleAgeSec: number | null;
  /** Seconds since last macro candle close. Null when unknown. */
  macroCandleAgeSec: number | null;
  /** Seconds since last trigger candle close. Null when unknown. */
  triggerCandleAgeSec: number | null;
  /** Seconds since last funding rate update. Null when unavailable. */
  fundingAgeSec: number | null;
  /** Seconds since last OI sample. Null when unavailable. */
  openInterestAgeSec: number | null;
}

export interface ScreenerResult {
  symbol: string;
  baseAsset: string;
  quoteAsset: string;
  marketCapRank?: number;
  setupTimeframe: BinanceInterval;
  triggerTimeframe: BinanceInterval;
  macroTimeframe: BinanceInterval;
  evaluatedAt: number;
  candleCloseTime: number | null;
  /** Last setup-candle close used as the market-price anchor for UI distance metrics. */
  currentPrice: number | null;
  dataHealth: FuturesDataHealth;
  action: FuturesSignalAction;
  confidence: number;
  grade: FuturesGrade;
  entry: number | null;
  stopLoss: number | null;
  takeProfits: Array<number | null>;
  riskReward: number | null;
  marketRegime: FuturesMarketRegimeId;
  tradePermission: FuturesTradePermission;
  reasons: string[];
  noTradeReasons: string[];
  fundingRate: number | null;
  openInterestChangePercent: number | null;
  mtfAlignmentScore: number | null;
  warnings: string[];
  /** Freshness metadata for UI display of data staleness. */
  freshness: ScreenerFreshnessMetadata;
}

export interface RankedScreenerResult extends ScreenerResult {
  rank: number;
  rankingScore: number;
  rankReason: string[];
  alertEligible: boolean;
  alertBlockReasons: string[];
}

export interface ScreenerAlertRecord {
  symbol: string;
  action: FuturesSignalAction;
  rankingScore: number;
  confidence: number;
  grade: FuturesGrade;
  entry: number | null;
  stopLoss: number | null;
  status: ScreenerAlertStatus;
  reason: string;
  createdAt: number;
}

/**
 * Append-only snapshot of screener setups that passed action-call gates.
 * Stored separately from alerts so cooldown/hourly caps do not hide valid
 * algorithm evaluation samples.
 */
export interface ScreenerActionCallRecord {
  id: string;
  runCompletedAt: number;
  capturedAt: number;
  symbol: string;
  baseAsset: string;
  quoteAsset: string;
  action: Exclude<FuturesSignalAction, 'WAIT'>;
  rank: number;
  rankingScore: number;
  confidence: number;
  grade: FuturesGrade;
  entry: number | null;
  stopLoss: number | null;
  takeProfits: Array<number | null>;
  riskReward: number | null;
  currentPrice: number | null;
  candleCloseTime: number | null;
  setupTimeframe: BinanceInterval;
  triggerTimeframe: BinanceInterval;
  macroTimeframe: BinanceInterval;
  marketRegime: FuturesMarketRegimeId;
  tradePermission: FuturesTradePermission;
  dataHealth: FuturesDataHealth;
  fundingRate: number | null;
  openInterestChangePercent: number | null;
  mtfAlignmentScore: number | null;
  marketCapRank?: number;
  reasons: string[];
  noTradeReasons: string[];
  warnings: string[];
  rankReason: string[];
  alertBlockReasons: string[];
}

export interface ScreenerAiAuditSummary {
  symbol: string;
  verdict: 'VALID' | 'WEAK' | 'WAIT_PREFERRED';
  summary: string;
  mainRisk: string;
  nextStep: string;
  caveats: string[];
  generatedAt: number;
  /** Optional AI-proposed levels. Must pass deterministic validation before display/use. */
  proposedLevels?: AiProposedLevels;
  /** Deterministic validation result for AI-proposed levels. */
  aiLevelValidationStatus: AiLevelValidationStatus;
  /** Reasons for validation rejection. Empty when VALIDATED or NOT_PROVIDED. */
  aiLevelValidationReasons: string[];
}

/**
 * AI-proposed trade levels. These are NEVER used directly — they must first
 * pass deterministic validation. The AI derives them from ATR, S/R, swing
 * high/low, liquidity zones, candle structure, and engine risk output only.
 */
export interface AiProposedLevels {
  entry: number | null;
  stopLoss: number | null;
  takeProfits: number[];
  /** Evidence references explaining which deterministic context produced each level. */
  basis: string[];
}

export type AiLevelValidationStatus = 'VALIDATED' | 'REJECTED' | 'NOT_PROVIDED';
