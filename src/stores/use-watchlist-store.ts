import { create } from 'zustand';
import type { WatchlistItem } from '@/types/market';
import { safeGetItem, safeSetItem, STORAGE_KEYS } from '@/lib/adapters/storage';

interface WatchlistState {
  /** List of watchlist items */
  items: WatchlistItem[];
  /** Whether the store has been hydrated from localStorage */
  hydrated: boolean;

  /** Hydrate store from localStorage */
  hydrate: () => void;
  /** Add a coin to watchlist. Returns false if invalid or already exists. */
  addCoin: (symbol: string, name: string) => boolean;
  /** Remove a coin from watchlist by symbol */
  removeCoin: (symbol: string) => void;
  /** Check if a coin is in the watchlist */
  isInWatchlist: (symbol: string) => boolean;
}

/** Normalize user/provider symbols so duplicates like `btc` and `BTC` cannot coexist. */
function normalizeSymbol(symbol: string): string {
  return symbol.trim().toUpperCase();
}

/**
 * Watchlist store — manages user's saved coins with localStorage persistence.
 * Prevents duplicates and persists across browser refreshes.
 */
export const useWatchlistStore = create<WatchlistState>((set, get) => ({
  items: [],
  hydrated: false,

  /** Hydrate from localStorage and normalize legacy symbols in-place. */
  hydrate: () => {
    const stored = safeGetItem<WatchlistItem[]>(STORAGE_KEYS.watchlist, []);
    const items = Array.isArray(stored)
      ? stored
          .map((item) => ({ ...item, symbol: normalizeSymbol(item.symbol), name: item.name.trim() }))
          .filter((item) => item.symbol && item.name)
      : [];

    // Self-heal: persist normalized items back if hydrate changed anything
    // (legacy lowercase symbol, dropped invalid row, name with whitespace).
    // Skip the write when nothing changed to avoid touching localStorage on
    // every mount.
    const changed =
      !Array.isArray(stored) ||
      stored.length !== items.length ||
      stored.some((legacy, i) => {
        const next = items[i];
        return !next || legacy.symbol !== next.symbol || legacy.name !== next.name;
      });
    if (changed) {
      safeSetItem(STORAGE_KEYS.watchlist, items);
    }

    set({ items, hydrated: true });
  },

  /** Add a normalized coin and persist the result. */
  addCoin: (symbol, name) => {
    const normalizedSymbol = normalizeSymbol(symbol);
    const normalizedName = name.trim();
    if (!normalizedSymbol || !normalizedName) return false;

    const state = get();
    if (state.items.some((item) => normalizeSymbol(item.symbol) === normalizedSymbol)) {
      return false;
    }

    const newItem: WatchlistItem = {
      symbol: normalizedSymbol,
      name: normalizedName,
      addedAt: new Date().toISOString(),
    };

    const updated = [...state.items, newItem];
    safeSetItem(STORAGE_KEYS.watchlist, updated);
    set({ items: updated });
    return true;
  },

  /** Remove a normalized symbol from the watchlist and persist the result. */
  removeCoin: (symbol) => {
    const normalizedSymbol = normalizeSymbol(symbol);
    const state = get();
    const updated = state.items.filter((item) => normalizeSymbol(item.symbol) !== normalizedSymbol);
    safeSetItem(STORAGE_KEYS.watchlist, updated);
    set({ items: updated });
  },

  /** Check membership using normalized symbols. */
  isInWatchlist: (symbol) => {
    const normalizedSymbol = normalizeSymbol(symbol);
    return get().items.some((item) => normalizeSymbol(item.symbol) === normalizedSymbol);
  },
}));
