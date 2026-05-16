'use client';

import { FearGreedTicker, LiveConnectionSummary, LiveTicker } from './live-ticker';

/**
 * Market Pulse Strip — distinctive identity element showing live connection
 * status, last update time, and key market movements.
 *
 * High-frequency price subscriptions live in LiveTicker so this shell stays
 * stable while individual ticker chips update independently.
 */
export function MarketPulseStrip() {
  return (
    <div className="border-b border-border-subtle bg-bg-surface-soft/50">
      <div className="mx-auto flex h-8 max-w-[1440px] items-center gap-3 overflow-x-auto px-4 text-xs lg:px-6">
        <LiveConnectionSummary />

        <div className="hidden h-3 w-px shrink-0 bg-border-subtle sm:block" />

        <LiveTicker />

        <FearGreedTicker />
      </div>
    </div>
  );
}
