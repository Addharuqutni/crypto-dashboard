'use client';

import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import {
  formatPriceAge,
  getPriceFreshness,
  getPriceFreshnessLabel,
  type PriceFreshness,
} from '@/lib/market/freshness';

const FRESHNESS_CLOCK_INTERVAL_MS = 1_000;

/**
 * Provides a shared low-frequency clock for visible realtime freshness labels.
 * Prices can become stale without receiving new WebSocket data, so UI badges
 * need time-based updates independent of market-store writes.
 */
export function useFreshnessClock(intervalMs = FRESHNESS_CLOCK_INTERVAL_MS): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(timer);
  }, [intervalMs]);

  return now;
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
