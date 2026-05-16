import { create } from 'zustand';
import type { WatchlistItem } from '@/types/market';
import { safeGetItem, safeSetItem, STORAGE_KEYS } from '@/lib/storage';

interface WatchlistState {
  /** List of watchlist items */
  items: WatchlistItem[];
  /** Whether the store has been hydrated from localStorage */
  hydrated: boolean;

  /** Hydrate store from localStorage */
  hydrate: () => void;
  /** Add a coin to watchlist. Returns false if already exists. */
  addCoin: (symbol: string, name: string) => boolean;
  /** Remove a coin from watchlist by symbol */
  removeCoin: (symbol: string) => void;
  /** Check if a coin is in the watchlist */
  isInWatchlist: (symbol: string) => boolean;
}

/**
 * Watchlist store — manages user's saved coins with localStorage persistence.
 * Prevents duplicates and persists across browser refreshes.
 */
export const useWatchlistStore = create<WatchlistState>((set, get) => ({
  items: [],
  hydrated: false,

  hydrate: () => {
    const stored = safeGetItem<WatchlistItem[]>(STORAGE_KEYS.watchlist, []);
    set({ items: stored, hydrated: true });
  },

  addCoin: (symbol, name) => {
    const state = get();
    if (state.items.some((item) => item.symbol === symbol)) {
      return false;
    }

    const newItem: WatchlistItem = {
      symbol,
      name,
      addedAt: new Date().toISOString(),
    };

    const updated = [...state.items, newItem];
    safeSetItem(STORAGE_KEYS.watchlist, updated);
    set({ items: updated });
    return true;
  },

  removeCoin: (symbol) => {
    const state = get();
    const updated = state.items.filter((item) => item.symbol !== symbol);
    safeSetItem(STORAGE_KEYS.watchlist, updated);
    set({ items: updated });
  },

  isInWatchlist: (symbol) => {
    return get().items.some((item) => item.symbol === symbol);
  },
}));
