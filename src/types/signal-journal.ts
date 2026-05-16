import type { FuturesSignalAction, FuturesSignalGrade } from './futures-signal';

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
 * One saved futures signal. Only fields actually verifiable from price data
 * are tracked — outcomes are never fabricated.
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
}
