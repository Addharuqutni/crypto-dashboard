import { create } from 'zustand';
import type { ThemePreference } from '@/types/market';
import { safeGetItem, safeSetItem, STORAGE_KEYS } from '@/lib/storage';

interface ThemeState {
  /** Current theme preference */
  theme: ThemePreference;
  /** Whether the store has been hydrated from localStorage */
  hydrated: boolean;

  /** Hydrate theme from localStorage */
  hydrate: () => void;
  /** Set theme preference */
  setTheme: (theme: ThemePreference) => void;
}

/**
 * Theme store — manages dark/light/system preference.
 * Dark mode is the default per ui-spec.md.
 */
export const useThemeStore = create<ThemeState>((set) => ({
  theme: 'dark',
  hydrated: false,

  hydrate: () => {
    const stored = safeGetItem<ThemePreference>(STORAGE_KEYS.theme, 'dark');
    set({ theme: stored, hydrated: true });
  },

  setTheme: (theme) => {
    safeSetItem(STORAGE_KEYS.theme, theme);
    set({ theme });
  },
}));
