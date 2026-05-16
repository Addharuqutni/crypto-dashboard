import { create } from 'zustand';
import type { SignalJournalEntry, SignalJournalMetrics, SignalJournalStatus } from '@/types/signal-journal';
import { safeGetItem, safeSetItem } from '@/lib/storage';

/**
 * Local persistence key. Versioned to allow safe future migrations.
 * Lives outside the central STORAGE_KEYS map because the journal is a v2-only
 * feature and we want to keep that map stable for now.
 */
const STORAGE_KEY = 'crypto-dashboard.signal-journal.v1';

/** Soft cap to prevent localStorage bloat. */
const MAX_ENTRIES = 200;

interface SignalJournalState {
  entries: SignalJournalEntry[];
  hydrated: boolean;

  hydrate: () => void;
  add: (entry: Omit<SignalJournalEntry, 'id' | 'createdAt' | 'status' | 'maxFavorableExcursion' | 'maxAdverseExcursion'>) => SignalJournalEntry | null;
  updateStatus: (id: string, status: SignalJournalStatus) => void;
  updateExcursions: (id: string, latestPrice: number) => void;
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

   * Mengembalikan status atau data baru agar UI bisa memberi feedback yang tepat.

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
      createdAt: Date.now(),
      status: 'PENDING',
      maxFavorableExcursion: null,
      maxAdverseExcursion: null,
    };

    const next = [newEntry, ...state.entries];
    safeSetItem(STORAGE_KEY, next);
    set({ entries: next });
    return newEntry;
  },

  /**

   * Memperbarui data status yang sudah tersimpan.

   * Dipakai agar mutation state tetap konsisten dan tidak tersebar di komponen.

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
   */
  updateExcursions: (id, latestPrice) => {
    if (!Number.isFinite(latestPrice) || latestPrice <= 0) return;

    const state = get();
    let mutated = false;
    const next = state.entries.map((entry) => {
      if (entry.id !== id) return entry;
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
        if (entry.tp3 != null && hasReachedTp(isLong, latestPrice, entry.tp3)) nextStatus = 'TP3';
        else if (entry.tp2 != null && hasReachedTp(isLong, latestPrice, entry.tp2)) nextStatus = 'TP2';
        else if (entry.tp1 != null && hasReachedTp(isLong, latestPrice, entry.tp1)) nextStatus = 'TP1';
      }

      if (
        newMfe === entry.maxFavorableExcursion &&
        newMae === entry.maxAdverseExcursion &&
        nextStatus === entry.status
      ) {
        return entry;
      }

      mutated = true;
      return {
        ...entry,
        maxFavorableExcursion: newMfe,
        maxAdverseExcursion: newMae,
        status: nextStatus,
      };
    });

    if (mutated) {
      safeSetItem(STORAGE_KEY, next);
      set({ entries: next });
    }
  },

  /**

   * Menghapus data remove dari state aplikasi.

   * Dipakai agar aturan penghapusan dan persistensi tetap berada di store terkait.

   */

  remove: (id) => {
    const state = get();
    const next = state.entries.filter((e) => e.id !== id);
    safeSetItem(STORAGE_KEY, next);
    set({ entries: next });
  },

  /**

   * Membersihkan data older than dari state aplikasi.

   * Dipakai untuk reset data lokal secara eksplisit sesuai aksi pengguna.

   */

  clearOlderThan: (epochMs) => {
    const state = get();
    const next = state.entries.filter((e) => e.createdAt >= epochMs);
    safeSetItem(STORAGE_KEY, next);
    set({ entries: next });
  },

  /**

   * Membersihkan data all dari state aplikasi.

   * Dipakai untuk reset data lokal secara eksplisit sesuai aksi pengguna.

   */

  clearAll: () => {
    safeSetItem(STORAGE_KEY, []);
    set({ entries: [] });
  },

  /**

   * Menjalankan logic metrics.

   * Dipakai untuk memisahkan tanggung jawab fungsi ini dari bagian aplikasi lain.

   */

  metrics: () => {
    const entries = get().entries;
    if (entries.length === 0) {
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
      };
    }

    const total = entries.length;
    const pending = entries.filter((e) => e.status === 'PENDING').length;
    const cancelled = entries.filter((e) => e.status === 'CANCELLED').length;
    const tpHits = entries.filter((e) => e.status === 'TP1' || e.status === 'TP2' || e.status === 'TP3').length;
    const slHits = entries.filter((e) => e.status === 'SL').length;
    // Closed trades = anything not pending/cancelled — used as denominator.
    const closed = entries.filter(
      (e) => e.status !== 'PENDING' && e.status !== 'CANCELLED'
    ).length;
    const denom = closed > 0 ? closed : 1;
    const sumConfidence = entries.reduce((s, e) => s + e.confidenceScore, 0);
    const bestGradeCount = entries.filter(
      (e) => e.signalGrade === 'A+' || e.signalGrade === 'A'
    ).length;

    // Per-action counts.
    const longCount = entries.filter((e) => e.action === 'LONG').length;
    const shortCount = entries.filter((e) => e.action === 'SHORT').length;
    const waitCount = entries.filter((e) => e.action === 'WAIT').length;

    // Per-side win rates (closed only).
    const longClosed = entries.filter(
      (e) => e.action === 'LONG' && e.status !== 'PENDING' && e.status !== 'CANCELLED'
    );
    const longWins = longClosed.filter(
      (e) => e.status === 'TP1' || e.status === 'TP2' || e.status === 'TP3'
    ).length;
    const shortClosed = entries.filter(
      (e) => e.action === 'SHORT' && e.status !== 'PENDING' && e.status !== 'CANCELLED'
    );
    const shortWins = shortClosed.filter(
      (e) => e.status === 'TP1' || e.status === 'TP2' || e.status === 'TP3'
    ).length;

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
      longWinRate: longClosed.length > 0 ? (longWins / longClosed.length) * 100 : 0,
      shortWinRate: shortClosed.length > 0 ? (shortWins / shortClosed.length) * 100 : 0,
    };
  },
}));

/**

 * Mengecek apakah kondisi has reached tp terpenuhi.

 * Mengembalikan boolean agar aturan validasi tetap eksplisit dan mudah dibaca.

 */

function hasReachedTp(isLong: boolean, latest: number, tp: number): boolean {
  return isLong ? latest >= tp : latest <= tp;
}

/**

 * Membuat id berdasarkan input saat ini.

 * Dipakai agar proses pembentukan data tetap konsisten di satu tempat.

 */

function generateId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}
