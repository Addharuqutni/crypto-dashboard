'use client';

import { useEffect, useRef } from 'react';
import type { FuturesSignal } from '@/types/futures-signal';

/**
 * Signal-Based Alert Evaluator.
 *
 * Watches a futures signal and emits browser notifications when configured
 * conditions trigger. Dedupes by signature so a stable signal does not spam
 * the user. Fails gracefully when notifications are disabled.
 *
 * Designed as a hook so it can live next to the futures panel without a new
 * provider layer.
 */

export interface SignalAlertConfig {
  /** Notify when action transitions to LONG. */
  onActionLong?: boolean;
  /** Notify when action transitions to SHORT. */
  onActionShort?: boolean;
  /** Notify when price enters the entry zone. */
  onEntryZoneTouch?: boolean;
  /** Notify when confidence score crosses this threshold (0–100). */
  confidenceThreshold?: number;
  /** Notify when risk level becomes LOW or MEDIUM. */
  onAcceptableRisk?: boolean;
  /** Notify when signal grade is A or A+. */
  onTopGrade?: boolean;
  /** Notify when MTF alignment crosses this threshold. */
  mtfAlignmentThreshold?: number;
  /** Cooldown in ms between identical notifications. Default 5 minutes. */
  cooldownMs?: number;
}

const DEFAULT_COOLDOWN_MS = 5 * 60 * 1000;

interface UseSignalAlertEvaluatorArgs {
  signal: FuturesSignal | null;
  symbol: string;
  timeframe: string;
  livePrice: number | null | undefined;
  config: SignalAlertConfig;
  enabled: boolean;
}

/**
 * Watches a signal and emits notifications when configured conditions hit.
 *
 * Dedupe key per condition includes symbol/timeframe/action so distinct
 * setups don't suppress each other. Cooldown prevents flapping notifications.
 */
export function useSignalAlertEvaluator({
  signal,
  symbol,
  timeframe,
  livePrice,
  config,
  enabled,
}: UseSignalAlertEvaluatorArgs): void {
  const lastFiredRef = useRef<Map<string, number>>(new Map());

  useEffect(() => {
    if (!enabled || !signal) return;
    if (typeof window === 'undefined') return;
    if (!('Notification' in window) || Notification.permission !== 'granted') return;

    const now = Date.now();
    const cooldown = config.cooldownMs ?? DEFAULT_COOLDOWN_MS;

    const tryFire = (key: string, title: string, body: string) => {
      const last = lastFiredRef.current.get(key);
      if (last != null && now - last < cooldown) return;
      lastFiredRef.current.set(key, now);
      try {
        new Notification(title, { body, icon: '/favicon.ico', tag: key });
      } catch {
        // Silently fail when the Notification API misbehaves.
      }
    };

    // Action LONG / SHORT.
    if (config.onActionLong && signal.action === 'LONG') {
      tryFire(
        `signal:${symbol}:${timeframe}:long:${signal.signalGrade}`,
        `LONG setup · ${symbol}`,
        `Grade ${signal.signalGrade} on ${timeframe}. Confidence ${signal.confidenceScore}.`
      );
    }
    if (config.onActionShort && signal.action === 'SHORT') {
      tryFire(
        `signal:${symbol}:${timeframe}:short:${signal.signalGrade}`,
        `SHORT setup · ${symbol}`,
        `Grade ${signal.signalGrade} on ${timeframe}. Confidence ${signal.confidenceScore}.`
      );
    }

    // Entry zone touch.
    if (
      config.onEntryZoneTouch &&
      signal.action !== 'WAIT' &&
      livePrice != null &&
      signal.entryZone.min != null &&
      signal.entryZone.max != null &&
      livePrice >= signal.entryZone.min &&
      livePrice <= signal.entryZone.max
    ) {
      tryFire(
        `signal:${symbol}:${timeframe}:zone`,
        `${symbol} in entry zone`,
        `${signal.action} setup. Price ${livePrice.toFixed(4)} inside ${signal.entryZone.min.toFixed(4)} – ${signal.entryZone.max.toFixed(4)}.`
      );
    }

    // Confidence threshold.
    if (
      config.confidenceThreshold != null &&
      signal.confidenceScore >= config.confidenceThreshold &&
      signal.action !== 'WAIT'
    ) {
      tryFire(
        `signal:${symbol}:${timeframe}:confidence:${Math.round(signal.confidenceScore / 5) * 5}`,
        `${symbol} confidence ≥ ${config.confidenceThreshold}`,
        `${signal.action} setup. Score ${signal.confidenceScore}.`
      );
    }

    // Acceptable risk.
    if (
      config.onAcceptableRisk &&
      (signal.riskLevel === 'LOW' || signal.riskLevel === 'MEDIUM') &&
      signal.action !== 'WAIT'
    ) {
      tryFire(
        `signal:${symbol}:${timeframe}:risk:${signal.riskLevel}`,
        `${symbol} acceptable risk`,
        `${signal.action} setup at ${signal.riskLevel} risk. Grade ${signal.signalGrade}.`
      );
    }

    // Top grade.
    if (
      config.onTopGrade &&
      (signal.signalGrade === 'A' || signal.signalGrade === 'A+') &&
      signal.action !== 'WAIT'
    ) {
      tryFire(
        `signal:${symbol}:${timeframe}:grade:${signal.signalGrade}`,
        `${symbol} top-grade setup`,
        `${signal.action} · grade ${signal.signalGrade} · score ${signal.confidenceScore}.`
      );
    }

    // MTF alignment threshold.
    if (
      config.mtfAlignmentThreshold != null &&
      signal.mtfConfirmation.alignmentScore >= config.mtfAlignmentThreshold
    ) {
      tryFire(
        `signal:${symbol}:${timeframe}:mtf:${Math.round(signal.mtfConfirmation.alignmentScore / 5) * 5}`,
        `${symbol} MTF aligned`,
        `Alignment ${signal.mtfConfirmation.alignmentScore.toFixed(0)} on ${timeframe}.`
      );
    }
  }, [signal, symbol, timeframe, livePrice, config, enabled]);
}

/**
 * Convenience: request notification permission once. Safe in SSR.
 *
 * Returns the permission outcome, or `'unsupported'` if the API is unavailable.
 */
export async function requestNotificationPermission(): Promise<NotificationPermission | 'unsupported'> {
  if (typeof window === 'undefined') return 'unsupported';
  if (!('Notification' in window)) return 'unsupported';
  if (Notification.permission === 'granted' || Notification.permission === 'denied') {
    return Notification.permission;
  }
  try {
    return await Notification.requestPermission();
  } catch {
    return 'denied';
  }
}
