import type {
  FuturesEntryTrigger,
  FuturesMarketRegimeId,
  FuturesSignalAction,
  FuturesSignalGrade,
  FuturesTradePermission,
} from './futures-signal';

/**
 * Outcome status for a saved journal entry.
 *
 *   PENDING   — saved, no outcome yet
 *   TP1/2/3   — price reached the corresponding take-profit
 *   SL        — price hit the stop loss
 *   EXPIRED   — entry never triggered within the holding window
 *   CANCELLED — user cancelled before any outcome
 */
export type SignalJournalStatus =
  | 'PENDING'
  | 'TP1'
  | 'TP2'
  | 'TP3'
  | 'SL'
  | 'EXPIRED'
  | 'CANCELLED';

/**
 * Where a journal entry came from. Used to filter paper-traded
 * signals from manually saved entries when computing edge.
 */
export type SignalJournalSource = 'manual' | 'paper';

/**
 * One saved futures signal. Only fields actually verifiable from price data
 * are tracked — outcomes are never fabricated.
 *
 * Phase 2: extended with optional fields needed for honest performance
 * measurement (R-multiple, regime, trigger, max-hold, snapshot hash). All
 * additions are optional so older serialized entries still load.
 */
export interface SignalJournalEntry {
  id: string;
  symbol: string;
  timeframe: string;
  action: FuturesSignalAction;
  confidenceScore: number;
  signalGrade: FuturesSignalGrade;
  entryPrice: number | null;
  stopLoss: number | null;
  tp1: number | null;
  tp2: number | null;
  tp3: number | null;
  /** Epoch ms — when the entry was saved. */
  createdAt: number;
  status: SignalJournalStatus;
  /** Highest favorable excursion (in price) since creation. */
  maxFavorableExcursion: number | null;
  /** Highest adverse excursion (in price) since creation. */
  maxAdverseExcursion: number | null;
  reasons: string[];
  warnings: string[];

  // ----- Phase 2 additive fields (all optional). -----

  /** Canonical 4H regime id snapshot when the signal was generated. */
  marketRegime?: FuturesMarketRegimeId;
  /** 4H trade permission snapshot. */
  tradePermission?: FuturesTradePermission;
  /** Entry trigger that fired. */
  setupType?: FuturesEntryTrigger;
  /** Risk:reward to TP2 reported by the engine. */
  riskRewardRatio?: number | null;
  /** Short, deterministic fingerprint of the data context used to decide. */
  dataSnapshot?: string;
  /** Where this entry came from. Defaults to 'manual' for legacy rows. */
  source?: SignalJournalSource;
  /** Final R-multiple realised after the trade closed. Null for open/expired. */
  finalR?: number | null;
  /** Maximum candles allowed before the entry is force-expired. */
  maxHoldCandles?: number;
  /**
   * Epoch ms after which a PENDING paper trade should be marked EXPIRED if no
   * outcome has been observed.
   */
  expiresAt?: number | null;
}

/** Aggregate metrics surfaced in the journal panel. */
export interface SignalJournalMetrics {
  total: number;
  pending: number;
  tp1HitRate: number;
  slHitRate: number;
  averageConfidence: number;
  bestGradeCount: number;
  /** Percentage of closed trades that hit any TP. */
  winRate: number;
  /** Percentage of closed trades that hit SL. */
  lossRate: number;
  /** Percentage of all entries that were cancelled. */
  cancelledRate: number;
  /** Count of LONG signals saved. */
  longCount: number;
  /** Count of SHORT signals saved. */
  shortCount: number;
  /** Count of WAIT signals saved. */
  waitCount: number;
  /** Win rate for LONG signals only (% of closed LONGs that hit TP). */
  longWinRate: number;
  /** Win rate for SHORT signals only (% of closed SHORTs that hit TP). */
  shortWinRate: number;

  // ----- Phase 3 additive fields. -----

  /** Total closed entries (TP/SL/EXPIRED). */
  closed: number;
  /** Total expired entries (PENDING that hit max-hold). */
  expired: number;
  /** Source breakdown. */
  paperCount: number;
  manualCount: number;
  /** Sum of finalR across closed entries. */
  closedR: number;
  /** Mean finalR across closed entries. */
  averageR: number;
  /** Implied unrealised R across PENDING entries (uses MFE/MAE). */
  openR: number;
  /** Highest finalR among closed entries. */
  bestR: number;
  /** Lowest finalR among closed entries. */
  worstR: number;
}
