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

  /**

   * Memuat ulang state hydrate dari penyimpanan lokal.

   * Dipakai agar data browser tetap tersedia setelah halaman direfresh.

   */

  hydrate: () => {
    const stored = safeGetItem<ThemePreference>(STORAGE_KEYS.theme, 'dark');
    set({ theme: stored, hydrated: true });
  },

  /**

   * Mengubah nilai theme pada state aplikasi.

   * Dipakai agar perubahan state tetap melalui satu jalur yang mudah dilacak.

   */

  setTheme: (theme) => {
    safeSetItem(STORAGE_KEYS.theme, theme);
    set({ theme });
  },
}));
