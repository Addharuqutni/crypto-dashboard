/**
 * Storage keys — versioned to allow safe future migrations.
 */
export const STORAGE_KEYS = {
  watchlist: 'crypto-dashboard.watchlist.v1',
  portfolio: 'crypto-dashboard.portfolio.v1',
  alerts: 'crypto-dashboard.alerts.v1',
  theme: 'crypto-dashboard.theme.v1',
  coinDetailMode: 'crypto-dashboard.coin-detail-mode.v1',
} as const;

/**
 * Safely parse JSON from localStorage.
 * Returns fallback value if parsing fails or key doesn't exist.
 */
export function safeGetItem<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;

  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    console.warn(`[Storage] Failed to parse key "${key}", returning fallback.`);
    return fallback;
  }
}

/**
 * Safely write JSON to localStorage.
 * Silently fails if storage is unavailable or quota exceeded.
 */
export function safeSetItem<T>(key: string, value: T): void {
  if (typeof window === 'undefined') return;

  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    console.warn(`[Storage] Failed to write key "${key}":`, error);
  }
}

/**
 * Remove item from localStorage safely.
 */
export function safeRemoveItem(key: string): void {
  if (typeof window === 'undefined') return;

  try {
    localStorage.removeItem(key);
  } catch {
    console.warn(`[Storage] Failed to remove key "${key}".`);
  }
}
