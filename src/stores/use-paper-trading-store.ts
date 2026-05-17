import { create } from 'zustand';
import type { FuturesSignal } from '@/types/futures-signal';
import type { SignalJournalEntry } from '@/types/signal-journal';
import { useSignalJournalStore } from './use-signal-journal-store';

/**
 * Paper-trading orchestrator.
 *
 * Lifecycle:
 *   1. `submitSignal(signal, ...)` — only LONG/SHORT signals with a valid
 *      entry+SL are accepted. WAITs are rejected outright (the engine's
 *      decision is honored).
 *   2. The signal is persisted to the journal as `source: 'paper'` with an
 *      `expiresAt` deadline derived from the timeframe + max hold.
 *   3. `applyMarketTick(symbol, price, ...)` forwards the price to the
 *      journal store's `updateExcursions` and runs `tickAll` so the entry
 *      auto-expires once its deadline passes.
 *
 * The store is intentionally tiny — it owns no state of its own beyond the
 * stats accessor. The journal is the single source of truth; this store only
 * provides domain-specific input validation and timeframe → ms translation.
 */

/** Default max-hold-in-candles per timeframe. Conservative for paper trading. */
const DEFAULT_MAX_HOLD_BY_TF: Record<string, number> = {
  '5m': 96,    // 8h
  '15m': 64,   // 16h
  '30m': 48,   // 24h
  '1H': 36,    // 36h
  '4H': 24,    // 4d
  '24H': 14,   // 2w
  '7D': 8,     // 8w
  '30D': 6,    // 6m
};

const TF_TO_MS: Record<string, number> = {
  '5m': 5 * 60 * 1000,
  '15m': 15 * 60 * 1000,
  '30m': 30 * 60 * 1000,
  '1H': 60 * 60 * 1000,
  '4H': 4 * 60 * 60 * 1000,
  '24H': 24 * 60 * 60 * 1000,
  '7D': 7 * 24 * 60 * 60 * 1000,
  '30D': 30 * 24 * 60 * 60 * 1000,
};

export interface PaperSubmitInput {
  symbol: string;
  timeframe: string;
  signal: FuturesSignal;
  /** Optional override for max hold in candles. */
  maxHoldCandles?: number;
  /** Optional override for createdAt; defaults to Date.now(). */
  nowMs?: number;
}

export interface PaperStats {
  /** Total paper-source entries (open + closed). */
  total: number;
  open: number;
  /** Wins counted across closed paper trades only. */
  wins: number;
  losses: number;
  expired: number;
  cancelled: number;
  winRate: number;
  /** Sum of finalR across closed paper trades. */
  totalR: number;
  averageR: number;
  /** Sample-size discipline warnings. */
  warnings: string[];
}

interface PaperTradingState {
  /**
   * Submit an actionable signal. Returns the persisted journal entry, or
   * `null` if the signal cannot be paper-traded (WAIT, missing entry/SL,
   * journal at capacity, etc.).
   */
  submitSignal: (input: PaperSubmitInput) => SignalJournalEntry | null;
  /** Forward the latest price + run expiry maintenance. */
  applyMarketTick: (symbol: string, price: number, nowMs?: number) => void;
  /** Aggregated stats over `source: 'paper'` entries. */
  stats: () => PaperStats;
}

export const usePaperTradingStore = create<PaperTradingState>((_, get) => ({
  submitSignal: (input) => {
    const s = input.signal;
    if (s.action !== 'LONG' && s.action !== 'SHORT') return null;
    if (s.entryZone.min == null || s.stopLoss == null) return null;

    const maxHold = input.maxHoldCandles ?? DEFAULT_MAX_HOLD_BY_TF[input.timeframe] ?? 48;
    const tfMs = TF_TO_MS[input.timeframe] ?? 30 * 60 * 1000;
    const createdAt = input.nowMs ?? Date.now();
    const expiresAt = createdAt + maxHold * tfMs;

    const journalAdd = useSignalJournalStore.getState().add;
    return journalAdd({
      symbol: input.symbol,
      timeframe: input.timeframe,
      action: s.action,
      confidenceScore: s.confidenceScore,
      signalGrade: s.signalGrade,
      entryPrice: s.entryZone.min,
      stopLoss: s.stopLoss,
      tp1: s.takeProfits.tp1,
      tp2: s.takeProfits.tp2,
      tp3: s.takeProfits.tp3,
      reasons: s.reasons,
      warnings: s.warnings,
      marketRegime: s.marketRegime,
      tradePermission: s.tradePermission,
      setupType: s.entryTrigger,
      riskRewardRatio: s.riskRewardRatio,
      dataSnapshot: snapshotHash(s),
      source: 'paper',
      maxHoldCandles: maxHold,
      expiresAt,
      createdAt,
    });
  },

  applyMarketTick: (symbol, price, nowMs) => {
    const journal = useSignalJournalStore.getState();
    if (!journal.hydrated) return;
    for (const entry of journal.entries) {
      if (entry.symbol !== symbol) continue;
      if (entry.source !== 'paper') continue;
      if (entry.status !== 'PENDING') continue;
      journal.updateExcursions(entry.id, price);
    }
    journal.tickAll(nowMs);
  },

  stats: () => {
    void get(); // future-proof: keep the closure stable
    const entries = useSignalJournalStore.getState().entries.filter(
      (e) => e.source === 'paper'
    );
    return computeStats(entries);
  },
}));

/**
 * Build a short, deterministic fingerprint of the signal context. Lets the
 * journal flag duplicate submissions and supports later audit replays.
 */
function snapshotHash(signal: FuturesSignal): string {
  const parts = [
    signal.action,
    signal.marketRegime,
    signal.tradePermission,
    signal.entryTrigger,
    Math.round(signal.confidenceScore),
    signal.signalGrade,
    Math.round((signal.entryZone.min ?? 0) * 100),
    Math.round((signal.stopLoss ?? 0) * 100),
  ];
  return parts.join(':');
}

function computeStats(entries: SignalJournalEntry[]): PaperStats {
  const total = entries.length;
  const open = entries.filter((e) => e.status === 'PENDING').length;
  const wins = entries.filter(
    (e) => e.status === 'TP1' || e.status === 'TP2' || e.status === 'TP3'
  ).length;
  const losses = entries.filter((e) => e.status === 'SL').length;
  const expired = entries.filter((e) => e.status === 'EXPIRED').length;
  const cancelled = entries.filter((e) => e.status === 'CANCELLED').length;
  const closed = wins + losses + expired;
  const winRate = closed > 0 ? (wins / closed) * 100 : 0;
  const finals = entries
    .map((e) => e.finalR ?? null)
    .filter((r): r is number => r != null);
  const totalR = finals.reduce((s, r) => s + r, 0);
  const averageR = finals.length > 0 ? totalR / finals.length : 0;

  const warnings: string[] = [];
  if (closed < 30) warnings.push('Insufficient sample (<30 closed paper trades).');
  else if (closed < 100) warnings.push('Weak confidence (<100 closed paper trades).');
  if (closed > 0 && averageR <= 0) {
    warnings.push('Average R \u2264 0 across closed paper trades. Engine not tradable as-is.');
  }

  return {
    total,
    open,
    wins,
    losses,
    expired,
    cancelled,
    winRate: round(winRate, 2),
    totalR: round(totalR, 4),
    averageR: round(averageR, 4),
    warnings,
  };
}

function round(v: number, digits: number): number {
  if (!Number.isFinite(v)) return v;
  const m = Math.pow(10, digits);
  return Math.round(v * m) / m;
}
