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
    <div className="border-b border-border-subtle">
      <div className="container-app flex h-9 items-center gap-3 overflow-x-auto text-xs">
        <LiveConnectionSummary />

        <div className="hidden h-3 w-px shrink-0 bg-border-subtle sm:block" />

        <LiveTicker />

        <FearGreedTicker />
      </div>
    </div>
  );
}
