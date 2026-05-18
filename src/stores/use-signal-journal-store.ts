import { create } from 'zustand';
import type {
  SignalJournalEntry,
  SignalJournalMetrics,
  SignalJournalStatus,
} from '@/types/signal-journal';
import { safeGetItem, safeSetItem } from '@/lib/storage';

/**
 * Local persistence key. Versioned to allow safe future migrations.
 * Lives outside the central STORAGE_KEYS map because the journal is a v2-only
 * feature and we want to keep that map stable for now.
 */
const STORAGE_KEY = 'crypto-dashboard.signal-journal.v1';

/** Soft cap to prevent localStorage bloat. */
const MAX_ENTRIES = 200;

/** Statuses considered "closed" — used both for metrics and gating mutations. */
const CLOSED_STATUSES: ReadonlyArray<SignalJournalStatus> = [
  'TP1',
  'TP2',
  'TP3',
  'SL',
  'EXPIRED',
];

/** Statuses that count as wins — TP-of-any-tier. */
const WIN_STATUSES: ReadonlyArray<SignalJournalStatus> = ['TP1', 'TP2', 'TP3'];

interface SignalJournalState {
  entries: SignalJournalEntry[];
  hydrated: boolean;

  hydrate: () => void;
  add: (
    entry: Omit<
      SignalJournalEntry,
      'id' | 'createdAt' | 'status' | 'maxFavorableExcursion' | 'maxAdverseExcursion'
    > & {
      /** Optional override for createdAt; defaults to Date.now(). */
      createdAt?: number;
    }
  ) => SignalJournalEntry | null;
  updateStatus: (id: string, status: SignalJournalStatus) => void;
  updateExcursions: (id: string, latestPrice: number) => void;

  /**
   * Apply a batch of latest prices in a single state update, then run expiry
   * maintenance. Prefer this over `updateExcursions` when iterating a price
   * snapshot — it avoids the N-rerender cascade you get from a per-entry loop
   * and keeps the rendered list stable across the tick.
   */
  applyTickBatch: (
    prices: Record<string, number | undefined | null>,
    nowMs?: number
  ) => void;

  /**
   * Manually mark a PENDING entry as closed with a user-confirmed outcome.
   *
   * Use when the trader exits at a price that doesn't match TP1/TP2/TP3/SL
   * exactly (slippage, partial fills, manual close). When `actualExitPrice`
   * is provided, finalR is computed from it; otherwise the canonical level
   * for that status is used.
   *
   * Will refuse to overwrite an already-closed entry — once-closed-stays-closed
   * keeps the audit trail honest.
   */
  markOutcome: (
    id: string,
    status: 'TP1' | 'TP2' | 'TP3' | 'SL' | 'EXPIRED',
    actualExitPrice?: number
  ) => void;

  /**
   * Run expiry + finalR maintenance across every entry. Safe to call on a
   * timer; no-op when nothing changes.
   */
  tickAll: (nowMs?: number) => void;
  remove: (id: string) => void;
  clearOlderThan: (epochMs: number) => void;
  clearAll: () => void;
  metrics: () => SignalJournalMetrics;
}

/**
 * Signal Journal store.
 *
 * Persisted via localStorage. Tracks user-saved signals and basic outcome
 * progress derived from observed prices. Outcomes are *only* updated from
 * real price data or explicit user action — never fabricated.
 */
export const useSignalJournalStore = create<SignalJournalState>((set, get) => ({
  entries: [],
  hydrated: false,

  /**
   * Memuat ulang state hydrate dari penyimpanan lokal.
   * Dipakai agar data browser tetap tersedia setelah halaman direfresh.
   */
  hydrate: () => {
    const stored = safeGetItem<SignalJournalEntry[]>(STORAGE_KEY, []);
    set({ entries: Array.isArray(stored) ? stored : [], hydrated: true });
  },

  /**
   * Menambahkan data add ke state aplikasi.
   * Mengembalikan entri baru, atau null saat kapasitas sudah penuh.
   */
  add: (entry) => {
    const state = get();
    if (state.entries.length >= MAX_ENTRIES) {
      console.warn(`[SignalJournal] Maximum entries (${MAX_ENTRIES}) reached.`);
      return null;
    }

    const newEntry: SignalJournalEntry = {
      ...entry,
      id: generateId(),
      createdAt: entry.createdAt ?? Date.now(),
      status: 'PENDING',
      maxFavorableExcursion: null,
      maxAdverseExcursion: null,
      source: entry.source ?? 'manual',
      finalR: entry.finalR ?? null,
    };

    const next = [newEntry, ...state.entries];
    safeSetItem(STORAGE_KEY, next);
    set({ entries: next });
    return newEntry;
  },

  /**
   * Memperbarui status entry yang sudah tersimpan tanpa menyentuh field lain.
   */
  updateStatus: (id, status) => {
    const state = get();
    const next = state.entries.map((e) => (e.id === id ? { ...e, status } : e));
    safeSetItem(STORAGE_KEY, next);
    set({ entries: next });
  },

  /**
   * Refresh maxFavorable/maxAdverse excursions from a freshly observed price.
   * Auto-promotes status when TP/SL levels are crossed.
   *
   * Outcomes are only updated based on actual observed prices — no fakery.
   * Prefer `applyTickBatch` when iterating multiple symbols at once.
   */
  updateExcursions: (id, latestPrice) => {
    if (!Number.isFinite(latestPrice) || latestPrice <= 0) return;

    const state = get();
    let mutated = false;
    const next = state.entries.map((entry) => {
      if (entry.id !== id) return entry;
      const updated = applyPriceToEntry(entry, latestPrice);
      if (updated !== entry) mutated = true;
      return updated;
    });

    if (mutated) {
      safeSetItem(STORAGE_KEY, next);
      set({ entries: next });
    }
  },

  /**
   * Batched price update for a snapshot of multiple symbols.
   * Single set() call regardless of how many entries match.
   */
  applyTickBatch: (prices, nowMs) => {
    const state = get();
    if (!state.hydrated) return;
    if (state.entries.length === 0) return;

    const now = nowMs ?? Date.now();
    let mutated = false;

    const next = state.entries.map((entry) => {
      // Step 1: price-driven excursion / TP / SL update.
      const price = prices[entry.symbol];
      let updated = entry;
      if (price != null && Number.isFinite(price) && price > 0) {
        updated = applyPriceToEntry(entry, price);
      }

      // Step 2: time-driven expiry. Re-check on the (possibly) updated entry
      // so we don't expire something we just promoted to TP/SL.
      if (
        updated.status === 'PENDING' &&
        updated.expiresAt != null &&
        now >= updated.expiresAt
      ) {
        updated = { ...updated, status: 'EXPIRED', finalR: 0 };
      }

      if (updated !== entry) mutated = true;
      return updated;
    });

    if (mutated) {
      safeSetItem(STORAGE_KEY, next);
      set({ entries: next });
    }
  },

  /**
   * User-confirmed outcome with optional override exit price.
   *
   * Refuses to mutate already-closed entries to keep the audit trail intact.
   */
  markOutcome: (id, status, actualExitPrice) => {
    const state = get();
    let mutated = false;
    const next = state.entries.map((entry) => {
      if (entry.id !== id) return entry;
      if (entry.status !== 'PENDING') return entry;

      let finalR: number | null = null;
      if (status === 'EXPIRED') {
        finalR = 0;
      } else if (
        entry.entryPrice != null &&
        entry.stopLoss != null &&
        actualExitPrice != null &&
        Number.isFinite(actualExitPrice)
      ) {
        finalR = computeFinalRFromExit(entry, actualExitPrice);
      } else {
        finalR = computeFinalR(entry, status);
      }

      mutated = true;
      return { ...entry, status, finalR };
    });

    if (mutated) {
      safeSetItem(STORAGE_KEY, next);
      set({ entries: next });
    }
  },

  /**
   * Force-expire any PENDING entry past its `expiresAt` deadline. Run on a
   * cadence (or on every tick) by callers that want max-hold enforcement.
   */
  tickAll: (nowMs?: number) => {
    const now = nowMs ?? Date.now();
    const state = get();
    let mutated = false;
    const next = state.entries.map((entry) => {
      if (entry.status !== 'PENDING') return entry;
      if (entry.expiresAt == null) return entry;
      if (now < entry.expiresAt) return entry;
      mutated = true;
      return { ...entry, status: 'EXPIRED' as SignalJournalStatus, finalR: 0 };
    });
    if (mutated) {
      safeSetItem(STORAGE_KEY, next);
      set({ entries: next });
    }
  },

  remove: (id) => {
    const state = get();
    const next = state.entries.filter((e) => e.id !== id);
    safeSetItem(STORAGE_KEY, next);
    set({ entries: next });
  },

  clearOlderThan: (epochMs) => {
    const state = get();
    const next = state.entries.filter((e) => e.createdAt >= epochMs);
    safeSetItem(STORAGE_KEY, next);
    set({ entries: next });
  },

  clearAll: () => {
    safeSetItem(STORAGE_KEY, []);
    set({ entries: [] });
  },

  /**
   * Aggregate metrics across the entire journal.
   *
   * Notes on semantics:
   *   - "closed" includes EXPIRED. Users care about realized outcome, not
   *     just user-marked TP/SL.
   *   - cancelled entries are excluded from win/loss rates so they can't
   *     drag the rate down.
   *   - openR sums the running R of PENDING entries using the latest known
   *     MFE/MAE — null if entry/SL missing.
   */
  metrics: (): SignalJournalMetrics => {
    const entries = get().entries;
    if (entries.length === 0) return emptyMetrics();

    const total = entries.length;
    const pending = entries.filter((e) => e.status === 'PENDING').length;
    const cancelled = entries.filter((e) => e.status === 'CANCELLED').length;
    const expired = entries.filter((e) => e.status === 'EXPIRED').length;
    const tpHits = entries.filter((e) => isWin(e.status)).length;
    const slHits = entries.filter((e) => e.status === 'SL').length;

    const closedEntries = entries.filter((e) => isClosed(e.status));
    const closed = closedEntries.length;
    const denom = closed > 0 ? closed : 1;

    const sumConfidence = entries.reduce((s, e) => s + e.confidenceScore, 0);
    const bestGradeCount = entries.filter(
      (e) => e.signalGrade === 'A+' || e.signalGrade === 'A'
    ).length;

    // Per-action counts.
    const longCount = entries.filter((e) => e.action === 'LONG').length;
    const shortCount = entries.filter((e) => e.action === 'SHORT').length;
    const waitCount = entries.filter((e) => e.action === 'WAIT').length;

    // Per-source counts.
    const paperCount = entries.filter((e) => e.source === 'paper').length;
    const backtestCount = entries.filter((e) => e.source === 'backtest').length;
    const manualCount = entries.filter(
      (e) => e.source === undefined || e.source === 'manual'
    ).length;

    // Per-side win rates over CLOSED only.
    const longClosed = entries.filter((e) => e.action === 'LONG' && isClosed(e.status));
    const longWins = longClosed.filter((e) => isWin(e.status)).length;
    const shortClosed = entries.filter((e) => e.action === 'SHORT' && isClosed(e.status));
    const shortWins = shortClosed.filter((e) => isWin(e.status)).length;

    // R aggregates.
    const realizedFinals = closedEntries
      .map((e) => e.finalR)
      .filter((r): r is number => r != null && Number.isFinite(r));
    const closedR = realizedFinals.reduce((s, r) => s + r, 0);
    const averageR =
      realizedFinals.length > 0 ? closedR / realizedFinals.length : 0;
    const bestR = realizedFinals.length > 0 ? Math.max(...realizedFinals) : 0;
    const worstR = realizedFinals.length > 0 ? Math.min(...realizedFinals) : 0;

    // Open R uses MFE/MAE-implied state — favors realism over optimism.
    let openR = 0;
    for (const e of entries) {
      if (e.status !== 'PENDING') continue;
      if (e.entryPrice == null || e.stopLoss == null) continue;
      const rDist = Math.abs(e.entryPrice - e.stopLoss);
      if (rDist <= 0) continue;
      const mfe = e.maxFavorableExcursion ?? 0;
      const mae = e.maxAdverseExcursion ?? 0;
      // We can't know the live price here, so use last known excursion delta.
      // If MAE > MFE → entry is currently underwater → openR ≈ -(mae/rDist).
      const live = mfe >= mae ? mfe : -mae;
      openR += live / rDist;
    }

    return {
      total,
      pending,
      tp1HitRate: closed === 0 ? 0 : (tpHits / denom) * 100,
      slHitRate: closed === 0 ? 0 : (slHits / denom) * 100,
      averageConfidence: total > 0 ? sumConfidence / total : 0,
      bestGradeCount,
      winRate: closed === 0 ? 0 : (tpHits / denom) * 100,
      lossRate: closed === 0 ? 0 : (slHits / denom) * 100,
      cancelledRate: total > 0 ? (cancelled / total) * 100 : 0,
      longCount,
      shortCount,
      waitCount,
      longWinRate:
        longClosed.length > 0 ? (longWins / longClosed.length) * 100 : 0,
      shortWinRate:
        shortClosed.length > 0 ? (shortWins / shortClosed.length) * 100 : 0,

      // Phase 3 additive — UI-only consumers can fall back to defaults.
      closed,
      expired,
      paperCount,
      manualCount,
      backtestCount,
      closedR: round4(closedR),
      averageR: round4(averageR),
      openR: round4(openR),
      bestR: round4(bestR),
      worstR: round4(worstR),
    };
  },
}));

// ---------------------------------------------------------------------------
// Internal pure helpers — intentionally exported for unit tests only.
// ---------------------------------------------------------------------------

/**
 * Pure update of a single entry from a new latest price. Returns the SAME
 * reference when nothing meaningful changed so callers can identity-compare
 * to short-circuit re-renders.
 */
export function applyPriceToEntry(
  entry: SignalJournalEntry,
  latestPrice: number
): SignalJournalEntry {
  if (entry.status !== 'PENDING') return entry;
  if (entry.entryPrice == null) return entry;

  const isLong = entry.action === 'LONG';
  const isShort = entry.action === 'SHORT';
  if (!isLong && !isShort) return entry;

  const favorable = isLong
    ? latestPrice - entry.entryPrice
    : entry.entryPrice - latestPrice;
  const adverse = isLong
    ? entry.entryPrice - latestPrice
    : latestPrice - entry.entryPrice;

  const newMfe =
    entry.maxFavorableExcursion == null
      ? Math.max(0, favorable)
      : Math.max(entry.maxFavorableExcursion, favorable);
  const newMae =
    entry.maxAdverseExcursion == null
      ? Math.max(0, adverse)
      : Math.max(entry.maxAdverseExcursion, adverse);

  let nextStatus: SignalJournalStatus = entry.status;

  // Stop loss has priority: a touch invalidates the trade outright.
  if (entry.stopLoss != null) {
    if (isLong && latestPrice <= entry.stopLoss) nextStatus = 'SL';
    else if (isShort && latestPrice >= entry.stopLoss) nextStatus = 'SL';
  }
  if (nextStatus === 'PENDING') {
    if (entry.tp3 != null && hasReachedTp(isLong, latestPrice, entry.tp3)) {
      nextStatus = 'TP3';
    } else if (entry.tp2 != null && hasReachedTp(isLong, latestPrice, entry.tp2)) {
      nextStatus = 'TP2';
    } else if (entry.tp1 != null && hasReachedTp(isLong, latestPrice, entry.tp1)) {
      nextStatus = 'TP1';
    }
  }

  if (
    newMfe === entry.maxFavorableExcursion &&
    newMae === entry.maxAdverseExcursion &&
    nextStatus === entry.status
  ) {
    return entry;
  }

  const closing = nextStatus !== 'PENDING';
  const finalR =
    closing && entry.entryPrice != null && entry.stopLoss != null
      ? computeFinalR(entry, nextStatus)
      : entry.finalR ?? null;

  return {
    ...entry,
    maxFavorableExcursion: newMfe,
    maxAdverseExcursion: newMae,
    status: nextStatus,
    finalR,
  };
}

function hasReachedTp(isLong: boolean, latest: number, tp: number): boolean {
  return isLong ? latest >= tp : latest <= tp;
}

/**
 * Compute the realised R-multiple for a closed journal entry using the
 * canonical level for that status. Returns null when entry/SL data is
 * insufficient. Costs (fees/slippage) are not applied here — the journal
 * records gross R; the backtest module owns the net-of-cost number.
 */
export function computeFinalR(
  entry: SignalJournalEntry,
  status: SignalJournalStatus
): number | null {
  if (entry.entryPrice == null || entry.stopLoss == null) return null;
  const rDist = Math.abs(entry.entryPrice - entry.stopLoss);
  if (rDist <= 0) return null;

  let exit: number | null = null;
  if (status === 'SL') exit = entry.stopLoss;
  else if (status === 'TP1' && entry.tp1 != null) exit = entry.tp1;
  else if (status === 'TP2' && entry.tp2 != null) exit = entry.tp2;
  else if (status === 'TP3' && entry.tp3 != null) exit = entry.tp3;
  else if (status === 'EXPIRED') return 0;
  if (exit == null) return null;

  return computeFinalRFromExit(entry, exit);
}

/**
 * Compute realised R given an actual exit price. Used both by canonical
 * level closes and by user-supplied overrides.
 */
export function computeFinalRFromExit(
  entry: SignalJournalEntry,
  exit: number
): number | null {
  if (entry.entryPrice == null || entry.stopLoss == null) return null;
  const rDist = Math.abs(entry.entryPrice - entry.stopLoss);
  if (rDist <= 0) return null;
  const isLong = entry.action === 'LONG';
  const pnl = isLong ? exit - entry.entryPrice : entry.entryPrice - exit;
  return round4(pnl / rDist);
}

function isWin(status: SignalJournalStatus): boolean {
  return WIN_STATUSES.includes(status);
}

function isClosed(status: SignalJournalStatus): boolean {
  return CLOSED_STATUSES.includes(status);
}

function emptyMetrics(): SignalJournalMetrics {
  return {
    total: 0,
    pending: 0,
    tp1HitRate: 0,
    slHitRate: 0,
    averageConfidence: 0,
    bestGradeCount: 0,
    winRate: 0,
    lossRate: 0,
    cancelledRate: 0,
    longCount: 0,
    shortCount: 0,
    waitCount: 0,
    longWinRate: 0,
    shortWinRate: 0,
    closed: 0,
    expired: 0,
    paperCount: 0,
    manualCount: 0,
    backtestCount: 0,
    closedR: 0,
    averageR: 0,
    openR: 0,
    bestR: 0,
    worstR: 0,
  };
}

function round4(v: number): number {
  if (!Number.isFinite(v)) return v;
  return Math.round(v * 10000) / 10000;
}

function generateId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}
