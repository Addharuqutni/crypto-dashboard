'use client';

import { AppShell } from '@/components/layout/app-shell';
import { SignalJournalPanel } from '@/components/technical-analysis/signal-journal';

/**
 * Signal Journal page — dedicated view for tracking futures signal outcomes.
 * Route: /journal
 *
 * Displays the full signal journal with metrics, live price tracking, and
 * outcome auto-promotion. Previously embedded in the coin detail page's
 * technical mode; now a standalone page for easier access and focus.
 */
export default function JournalPage() {
  return (
    <AppShell>
      <div className="space-y-8">
        <div>
          <h1 className="h1">
            Signal Journal
          </h1>
          <p className="mt-1 text-sm text-text-secondary">
            Track your futures signal outcomes. Entries are auto-updated with live prices from Binance Futures WebSocket.
          </p>
        </div>

        <SignalJournalPanel />
      </div>
    </AppShell>
  );
}
