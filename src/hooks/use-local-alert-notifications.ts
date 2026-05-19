'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import type { ScreenerAlertRecord } from '@/lib/application/screener/types';

export type NotificationPermissionState = 'default' | 'granted' | 'denied' | 'unsupported';

/**
 * Optional browser notification hook for local triggered alerts.
 *
 * Behavior:
 *   - Permission must be requested explicitly by the user (no auto-prompt).
 *   - Notifications mirror local triggered alerts only (never external delivery).
 *   - Local alert history remains the source of truth.
 *   - Each (symbol, createdAt) is fired at most once per session via an in-memory Set.
 *
 * Safety:
 *   - Never spams the prompt — only requestPermission() in response to user click.
 *   - Skips silently when permission not granted or feature unsupported.
 */
export function useLocalAlertNotifications(triggeredAlerts: ScreenerAlertRecord[]) {
  const [permission, setPermission] = useState<NotificationPermissionState>('default');
  const seenRef = useRef<Set<string>>(new Set());

  // Detect support and current permission state once on mount.
  useEffect(() => {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      setPermission('unsupported');
      return;
    }
    setPermission(Notification.permission as NotificationPermissionState);
  }, []);

  // Mirror new triggered alerts as notifications when permission is granted.
  useEffect(() => {
    if (permission !== 'granted') return;
    if (typeof window === 'undefined' || !('Notification' in window)) return;

    for (const alert of triggeredAlerts) {
      const key = `${alert.symbol}|${alert.createdAt}`;
      if (seenRef.current.has(key)) continue;
      seenRef.current.add(key);

      try {
        new Notification(`Local alert: ${alert.symbol} ${alert.action}`, {
          body: `Confidence ${alert.confidence}% · Grade ${alert.grade} · Score ${alert.rankingScore.toFixed(1)}`,
          tag: alert.symbol,
        });
      } catch {
        // Silently ignore platform-specific notification errors.
      }
    }
  }, [triggeredAlerts, permission]);

  /**
   * Request notification permission. Must be called from a user gesture.
   * Returns the resulting permission state.
   */
  const requestPermission = useCallback(async (): Promise<NotificationPermissionState> => {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      setPermission('unsupported');
      return 'unsupported';
    }
    try {
      const result = await Notification.requestPermission();
      const state = result as NotificationPermissionState;
      setPermission(state);
      return state;
    } catch {
      return permission;
    }
  }, [permission]);

  return { permission, requestPermission };
}
