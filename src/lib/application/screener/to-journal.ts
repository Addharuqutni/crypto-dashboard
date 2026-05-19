import type { RankedScreenerResult } from '@/lib/application/screener/types';
import type { SignalJournalEntry } from '@/types/signal-journal';

/**
 * Shape that the journal store expects for `add()` (without the fields it generates).
 * Mirrors the public Omit<...> in `useSignalJournalStore`.
 */
export type JournalAddPayload = Omit<
  SignalJournalEntry,
  'id' | 'createdAt' | 'status' | 'maxFavorableExcursion' | 'maxAdverseExcursion'
> & { createdAt?: number };

/**
 * Reasons why a screener row cannot be saved to the journal.
 * Returned alongside `null` payload so the UI can disable the save button
 * with an explanation instead of failing silently.
 */
export type JournalSaveBlock =
  | 'action_is_wait'
  | 'missing_entry'
  | 'missing_stop_loss'
  | 'missing_take_profit';

export interface MapResult {
  payload: JournalAddPayload | null;
  blocks: JournalSaveBlock[];
}

/**
 * Map a screener row into a journal-add payload.
 *
 * Why this lives outside the component:
 *   - Pure function, easy to unit test.
 *   - Keeps the screener UI free of journal-shape coupling.
 *   - Makes the "what blocks saving" rules explicit and reviewable.
 *
 * Rules:
 *   - WAIT setups cannot be saved — there is no trade to track.
 *   - Entry, stop loss, and at least one take-profit are required.
 *   - Source is always 'manual' (user-initiated save from screener UI).
 *   - finalR/expiresAt remain null — outcome is observed, not assumed.
 */
export function mapScreenerToJournal(result: RankedScreenerResult): MapResult {
  const blocks: JournalSaveBlock[] = [];

  if (result.action === 'WAIT') blocks.push('action_is_wait');
  if (result.entry == null) blocks.push('missing_entry');
  if (result.stopLoss == null) blocks.push('missing_stop_loss');
  if (result.takeProfits.length === 0) blocks.push('missing_take_profit');

  if (blocks.length > 0) {
    return { payload: null, blocks };
  }

  const [tp1, tp2, tp3] = result.takeProfits;

  const payload: JournalAddPayload = {
    // Journal + market store use base asset keys (BTC), not Binance pairs (BTCUSDT).
    // Keeping this convention makes live price and PnL resolve immediately.
    symbol: result.baseAsset,
    timeframe: result.setupTimeframe,
    action: result.action,
    confidenceScore: result.confidence,
    signalGrade: result.grade,
    entryPrice: result.entry,
    stopLoss: result.stopLoss,
    tp1: tp1 ?? null,
    tp2: tp2 ?? null,
    tp3: tp3 ?? null,
    reasons: result.reasons,
    warnings: result.warnings,
    marketRegime: result.marketRegime,
    tradePermission: result.tradePermission,
    riskRewardRatio: result.riskReward,
    source: 'manual',
    finalR: null,
    expiresAt: null,
    dataSnapshot: buildDataSnapshot(result),
  };

  return { payload, blocks: [] };
}

/**
 * Compact, deterministic fingerprint of the inputs that drove the decision.
 * Useful for de-duplicating saves of the same setup at the same candle close.
 */
function buildDataSnapshot(r: RankedScreenerResult): string {
  return [
    r.symbol,
    r.action,
    r.candleCloseTime,
    r.entry?.toFixed(6) ?? 'na',
    r.stopLoss?.toFixed(6) ?? 'na',
    r.confidence,
    r.grade,
  ].join('|');
}

/** Human-readable label for a save block reason. */
export function describeJournalBlock(block: JournalSaveBlock): string {
  switch (block) {
    case 'action_is_wait':
      return 'WAIT setups have no trade to journal.';
    case 'missing_entry':
      return 'Engine entry price is missing.';
    case 'missing_stop_loss':
      return 'Engine stop loss is missing.';
    case 'missing_take_profit':
      return 'Engine has no take-profit levels.';
  }
}
