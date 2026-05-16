import { create } from 'zustand';
import type { PriceAlert } from '@/types/alert';
import { safeGetItem, safeSetItem, STORAGE_KEYS } from '@/lib/storage';

interface AlertState {
  alerts: PriceAlert[];
  hydrated: boolean;

  hydrate: () => void;
  addAlert: (alert: Omit<PriceAlert, 'id' | 'status' | 'createdAt'>) => void;
  removeAlert: (id: string) => void;
  triggerAlert: (id: string) => void;
  getActiveAlerts: () => PriceAlert[];
  getTriggeredAlerts: () => PriceAlert[];
}

/** Maximum number of alerts a user can create to prevent storage bloat */
const MAX_ALERTS = 50;

/**
 * Alert store — manages price alerts with localStorage persistence.
 * Alerts are evaluated against live prices in the alert evaluator hook.
 * Includes input validation and domain guards.
 */
export const useAlertStore = create<AlertState>((set, get) => ({
  alerts: [],
  hydrated: false,

  hydrate: () => {
    const stored = safeGetItem<PriceAlert[]>(STORAGE_KEYS.alerts, []);
    set({ alerts: stored, hydrated: true });
  },

  addAlert: (alert) => {
    // Validate target price
    if (!isValidPositiveNumber(alert.targetPrice)) {
      console.warn('[Alerts] Invalid target price — must be a positive finite number.');
      return;
    }

    // Validate symbol
    if (!alert.symbol || typeof alert.symbol !== 'string') {
      console.warn('[Alerts] Invalid symbol.');
      return;
    }

    // Validate condition
    if (alert.condition !== 'greater_than' && alert.condition !== 'less_than') {
      console.warn('[Alerts] Invalid condition — must be "greater_than" or "less_than".');
      return;
    }

    const state = get();

    // Prevent alert overflow
    if (state.alerts.length >= MAX_ALERTS) {
      console.warn(`[Alerts] Maximum alert limit (${MAX_ALERTS}) reached.`);
      return;
    }

    const normalizedSymbol = alert.symbol.toUpperCase().trim();

    // Prevent duplicate alerts (same symbol + condition + target price)
    const isDuplicate = state.alerts.some(
      (a) =>
        a.symbol === normalizedSymbol &&
        a.condition === alert.condition &&
        a.targetPrice === alert.targetPrice &&
        a.status === 'active'
    );
    if (isDuplicate) {
      console.warn('[Alerts] Duplicate alert already exists.');
      return;
    }

    const newAlert: PriceAlert = {
      ...alert,
      symbol: normalizedSymbol,
      id: generateId(),
      status: 'active',
      createdAt: new Date().toISOString(),
    };

    const updated = [...state.alerts, newAlert];
    safeSetItem(STORAGE_KEYS.alerts, updated);
    set({ alerts: updated });
  },

  removeAlert: (id) => {
    const state = get();
    const updated = state.alerts.filter((a) => a.id !== id);
    safeSetItem(STORAGE_KEYS.alerts, updated);
    set({ alerts: updated });
  },

  triggerAlert: (id) => {
    const state = get();
    const updated = state.alerts.map((a) =>
      a.id === id
        ? { ...a, status: 'triggered' as const, triggeredAt: new Date().toISOString() }
        : a
    );
    safeSetItem(STORAGE_KEYS.alerts, updated);
    set({ alerts: updated });
  },

  getActiveAlerts: () => get().alerts.filter((a) => a.status === 'active'),
  getTriggeredAlerts: () => get().alerts.filter((a) => a.status === 'triggered'),
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
