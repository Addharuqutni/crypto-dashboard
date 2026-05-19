import { create } from 'zustand';
import type { PortfolioHolding } from '@/types/portfolio';
import { safeGetItem, safeSetItem, STORAGE_KEYS } from '@/lib/adapters/storage';

interface PortfolioState {
  holdings: PortfolioHolding[];
  hydrated: boolean;

  hydrate: () => void;
  addHolding: (holding: Omit<PortfolioHolding, 'id' | 'createdAt' | 'updatedAt'>) => void;
  updateHolding: (id: string, updates: Partial<Pick<PortfolioHolding, 'quantity' | 'averageBuyPrice'>>) => void;
  removeHolding: (id: string) => void;
}

/**
 * Portfolio store — manages user's crypto holdings with localStorage persistence.
 * Supports add, update, delete operations with input validation.
 */
export const usePortfolioStore = create<PortfolioState>((set, get) => ({
  holdings: [],
  hydrated: false,

  /**

   * Memuat ulang state hydrate dari penyimpanan lokal.

   * Dipakai agar data browser tetap tersedia setelah halaman direfresh.

   */

  hydrate: () => {
    const stored = safeGetItem<PortfolioHolding[]>(STORAGE_KEYS.portfolio, []);
    set({ holdings: stored, hydrated: true });
  },

  /**

   * Menambahkan data holding ke state aplikasi.

   * Mengembalikan status atau data baru agar UI bisa memberi feedback yang tepat.

   */

  addHolding: (holding) => {
    // Validate inputs before persisting
    if (!isValidPositiveNumber(holding.quantity)) {
      console.warn('[Portfolio] Invalid quantity — must be a positive finite number.');
      return;
    }
    if (!isValidPositiveNumber(holding.averageBuyPrice)) {
      console.warn('[Portfolio] Invalid buy price — must be a positive finite number.');
      return;
    }
    if (!holding.symbol || typeof holding.symbol !== 'string') {
      console.warn('[Portfolio] Invalid symbol.');
      return;
    }

    const state = get();
    const normalizedSymbol = holding.symbol.toUpperCase().trim();

    // Prevent duplicate holdings for the same coin
    const existing = state.holdings.find((h) => h.symbol === normalizedSymbol);
    if (existing) {
      console.warn(`[Portfolio] Holding for ${normalizedSymbol} already exists. Use updateHolding instead.`);
      return;
    }

    const newHolding: PortfolioHolding = {
      ...holding,
      symbol: normalizedSymbol,
      id: generateId(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const updated = [...state.holdings, newHolding];
    safeSetItem(STORAGE_KEYS.portfolio, updated);
    set({ holdings: updated });
  },

  /**

   * Memperbarui data holding yang sudah tersimpan.

   * Dipakai agar mutation state tetap konsisten dan tidak tersebar di komponen.

   */

  updateHolding: (id, updates) => {
    // Validate numeric updates if provided
    if (updates.quantity !== undefined && !isValidPositiveNumber(updates.quantity)) {
      console.warn('[Portfolio] Invalid quantity update — must be a positive finite number.');
      return;
    }
    if (updates.averageBuyPrice !== undefined && !isValidPositiveNumber(updates.averageBuyPrice)) {
      console.warn('[Portfolio] Invalid buy price update — must be a positive finite number.');
      return;
    }

    const state = get();
    const updated = state.holdings.map((h) =>
      h.id === id
        ? { ...h, ...updates, updatedAt: new Date().toISOString() }
        : h
    );
    safeSetItem(STORAGE_KEYS.portfolio, updated);
    set({ holdings: updated });
  },

  /**

   * Menghapus data holding dari state aplikasi.

   * Dipakai agar aturan penghapusan dan persistensi tetap berada di store terkait.

   */

  removeHolding: (id) => {
    const state = get();
    const updated = state.holdings.filter((h) => h.id !== id);
    safeSetItem(STORAGE_KEYS.portfolio, updated);
    set({ holdings: updated });
  },
}));

/**
 * Validate that a value is a positive, finite number.
 * Rejects NaN, Infinity, zero, and negative values.
 */
function isValidPositiveNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

/**
 * Generate a unique ID using crypto.randomUUID when available,
 * with a timestamp+random fallback for older environments.
 */
function generateId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}
