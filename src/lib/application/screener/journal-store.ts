import { existsSync, mkdirSync, readFileSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import type { SignalJournalEntry } from '@/types/signal-journal';
import type { RankedScreenerResult } from './types';

/**
 * Server-side signal journal persistence.
 *
 * Append-only JSONL file at `data/screener/signal-journal.jsonl`.
 * The automation screener writes here when action-call-eligible results
 * are detected. The UI can read these via the `/api/screener` endpoint
 * alongside client-side localStorage entries.
 *
 * Source is always 'paper' for automation-generated entries so the UI
 * can distinguish them from user-saved ('manual') entries.
 */

const DATA_DIR = join(process.cwd(), 'data', 'screener');
const JOURNAL_FILE = join(DATA_DIR, 'signal-journal.jsonl');

function ensureDir(): void {
  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true });
  }
}

let idCounter = 0;
function generateId(): string {
  idCounter += 1;
  return `paper-${Date.now()}-${idCounter.toString(36)}`;
}

/**
 * Map a screener result to a journal entry suitable for paper-trade tracking.
 *
 * Blocks:
 *   - WAIT action (no trade to track)
 *   - Missing entry / stop loss / take profits
 *
 * Returns null if the result can't be journaled.
 */
export function screenerResultToJournalEntry(
  result: RankedScreenerResult,
  runCompletedAt: number,
): SignalJournalEntry | null {
  if (result.action === 'WAIT') return null;
  if (result.entry == null) return null;
  if (result.stopLoss == null) return null;
  if (result.takeProfits.length === 0) return null;

  const [tp1, tp2, tp3] = result.takeProfits;

  return {
    id: generateId(),
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
    createdAt: runCompletedAt,
    status: 'PENDING',
    maxFavorableExcursion: null,
    maxAdverseExcursion: null,
    reasons: result.reasons,
    warnings: result.warnings,
    marketRegime: result.marketRegime,
    tradePermission: result.tradePermission,
    riskRewardRatio: result.riskReward,
    source: 'paper',
    finalR: null,
    expiresAt: null,
    dataSnapshot: [
      result.symbol,
      result.action,
      result.candleCloseTime,
      result.entry?.toFixed(6) ?? 'na',
      result.stopLoss?.toFixed(6) ?? 'na',
      result.confidence,
      result.grade,
    ].join('|'),
  };
}

/**
 * Append journal entries to the server-side JSONL store.
 */
export function appendJournalEntries(entries: SignalJournalEntry[]): void {
  if (entries.length === 0) return;
  ensureDir();
  const lines = entries.map((e) => JSON.stringify(e)).join('\n') + '\n';
  appendFileSync(JOURNAL_FILE, lines, 'utf-8');
}

/**
 * Read the most recent N journal entries from the JSONL store.
 */
export function readRecentJournalEntries(limit = 100): SignalJournalEntry[] {
  if (!existsSync(JOURNAL_FILE)) return [];
  try {
    const raw = readFileSync(JOURNAL_FILE, 'utf-8').trim();
    if (!raw) return [];
    const lines = raw.split('\n');
    const entries: SignalJournalEntry[] = [];
    // Read from end for most recent
    for (let i = lines.length - 1; i >= 0 && entries.length < limit; i--) {
      const line = lines[i];
      if (!line) continue;
      try {
        entries.push(JSON.parse(line) as SignalJournalEntry);
      } catch {
        // skip malformed lines
      }
    }
    return entries;
  } catch {
    return [];
  }
}

/**
 * Check if a setup with the same dataSnapshot already exists in recent entries.
 * Used to deduplicate — same candle close time + symbol + action = same setup.
 */
export function isAlreadyJournaled(
  dataSnapshot: string | undefined,
  recentEntries: SignalJournalEntry[],
): boolean {
  if (!dataSnapshot) return false;
  return recentEntries.some((e) => e.dataSnapshot != null && e.dataSnapshot === dataSnapshot);
}
