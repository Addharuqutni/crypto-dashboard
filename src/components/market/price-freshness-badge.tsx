'use client';

import { useSyncExternalStore } from 'react';
import { cn } from '@/lib/shared/utils';
import {
  formatPriceAge,
  getPriceFreshness,
  getPriceFreshnessLabel,
  type PriceFreshness,
} from '@/lib/shared/market/freshness';

const FRESHNESS_CLOCK_INTERVAL_MS = 1_000;

/**
 * One timer shared by every consumer, rather than one per caller.
 *
 * The market table renders 48 rows in two live variants (table + cards are
 * mutually exclusive, mobile cards always render), so a per-instance
 * `setInterval` meant 96 concurrent 1 Hz timers on the dashboard alone. They
 * all tick in lockstep on the same boundary anyway, so the schedule is
 * identical — only the cost of owning 96 of them disappears.
 *
 * The timer starts on the first subscriber and stops when the last one leaves,
 * so a page with no freshness labels schedules nothing.
 *
 * Note this does not cut re-renders: rows genuinely read `now` to derive
 * `isLive`/`isStale`, so they still re-render each tick. Cutting those would
 * mean moving the age label out of the price row, which would lose the
 * per-second "Updated N seconds ago" tooltip.
 */
type ClockListener = () => void;

const listeners = new Set<ClockListener>();
let timer: ReturnType<typeof setInterval> | null = null;
let currentTime = Date.now();

function subscribe(listener: ClockListener): () => void {
  listeners.add(listener);
  if (timer === null && typeof window !== 'undefined') {
    currentTime = Date.now();
    timer = setInterval(() => {
      currentTime = Date.now();
      for (const notify of listeners) notify();
    }, FRESHNESS_CLOCK_INTERVAL_MS);
  }

  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && timer !== null) {
      clearInterval(timer);
      timer = null;
    }
  };
}

const getSnapshot = () => currentTime;

/**
 * Provides a shared low-frequency clock for visible realtime freshness labels.
 * Prices can become stale without receiving new WebSocket data, so UI badges
 * need time-based updates independent of market-store writes.
 */
export function useFreshnessClock(): number {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/** Renders an accessible realtime freshness badge for market prices. */
export function PriceFreshnessBadge({
  receivedAt,
  now,
  compact = false,
}: {
  receivedAt?: number;
  now: number;
  compact?: boolean;
}) {
  const freshness = getPriceFreshness(receivedAt, now);
  const label = getPriceFreshnessLabel(freshness);
  const ageLabel = formatPriceAge(receivedAt, now);

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em]',
        getFreshnessTone(freshness),
        compact && 'px-1.5 text-[9px] tracking-[0.1em]'
      )}
      title={`${label} — ${ageLabel}`}
      aria-label={`Price feed ${label.toLowerCase()}. ${ageLabel}.`}
    >
      <span className={cn('h-1.5 w-1.5 rounded-full', getFreshnessDotTone(freshness))} aria-hidden="true" />
      {compact ? label.slice(0, 1) : label}
    </span>
  );
}

/** Maps freshness states to badge color tokens while preserving text contrast. */
function getFreshnessTone(freshness: PriceFreshness): string {
  switch (freshness) {
    case 'live':
      return 'border-market-up/25 bg-market-up/10 text-market-up';
    case 'delayed':
      return 'border-warning/30 bg-warning/10 text-warning';
    case 'stale':
      return 'border-danger/30 bg-danger/10 text-danger';
  }
}

/** Maps freshness states to a non-text dot so status is scannable in dense rows. */
function getFreshnessDotTone(freshness: PriceFreshness): string {
  switch (freshness) {
    case 'live':
      return 'bg-market-up shadow-[0_0_10px_rgba(34,197,94,0.7)]';
    case 'delayed':
      return 'bg-warning shadow-[0_0_10px_rgba(245,158,11,0.65)]';
    case 'stale':
      return 'bg-danger shadow-[0_0_10px_rgba(239,68,68,0.65)]';
  }
}
