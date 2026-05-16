'use client';

import { useEffect, useRef } from 'react';
import { useAlertStore } from '@/stores/use-alert-store';
import { useMarketStore } from '@/stores/use-market-store';

/**
 * Alert evaluator hook — checks active alerts against live prices.
 * Triggers browser notification when conditions are met.
 * Must be rendered once at app level (inside DataProvider).
 */
export function useAlertEvaluator() {
  const alerts = useAlertStore((s) => s.alerts);
  const triggerAlert = useAlertStore((s) => s.triggerAlert);
  const prices = useMarketStore((s) => s.prices);
  const triggeredRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const activeAlerts = alerts.filter((a) => a.status === 'active');

    for (const alert of activeAlerts) {
      // Skip if already triggered in this session
      if (triggeredRef.current.has(alert.id)) continue;

      const livePrice = prices[alert.symbol];
      if (!livePrice) continue;

      let shouldTrigger = false;

      if (alert.condition === 'greater_than' && livePrice.price >= alert.targetPrice) {
        shouldTrigger = true;
      } else if (alert.condition === 'less_than' && livePrice.price <= alert.targetPrice) {
        shouldTrigger = true;
      }

      if (shouldTrigger) {
        triggeredRef.current.add(alert.id);
        triggerAlert(alert.id);
        sendNotification(alert.symbol, alert.condition, alert.targetPrice, livePrice.price);
      }
    }
  }, [alerts, prices, triggerAlert]);
}

/**
 * Send browser notification for triggered alert.
 */
function sendNotification(
  symbol: string,
  condition: 'greater_than' | 'less_than',
  targetPrice: number,
  currentPrice: number
) {
  if (typeof window === 'undefined') return;
  if (!('Notification' in window)) return;
  if (Notification.permission !== 'granted') return;

  const conditionText = condition === 'greater_than' ? 'above' : 'below';
  const title = `${symbol} Price Alert`;
  const body = `${symbol} is now ${conditionText} $${targetPrice.toLocaleString()} (current: $${currentPrice.toLocaleString()})`;

  try {
    new Notification(title, {
      body,
      icon: '/favicon.ico',
      tag: `alert-${symbol}-${targetPrice}`,
    });
  } catch {
    // Silently fail if notification API is unavailable
  }
}
