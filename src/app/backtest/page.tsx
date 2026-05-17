'use client';

import { AppShell } from '@/components/layout/app-shell';
import { BacktestPanel } from '@/components/backtest/backtest-panel';
import { PaperTradingPanel } from '@/components/backtest/paper-trading-panel';

/**
 * Backtest validation page.
 * Route: /backtest
 *
 * Two stacked panels:
 *   1. Engine Backtest — deterministic fixture replay across the five
 *      canonical regimes with full Phase 2 metrics.
 *   2. Paper Trading — live status of signals submitted from the Futures
 *      panel with `source: 'paper'`.
 */
export default function BacktestPage() {
  return (
    <AppShell>
      <div className="space-y-6">
        <div>
          <h1 className="font-[family-name:var(--font-display)] text-2xl font-bold text-text-primary">
            Engine Validation
          </h1>
          <p className="mt-1 text-sm text-text-secondary">
            Run the signal engine against deterministic regime fixtures and track paper signals
            against live Binance Futures prices. Capital preservation beats inflated backtest
            numbers &mdash; warnings below are surfaced verbatim.
          </p>
        </div>

        <BacktestPanel />
        <PaperTradingPanel />
      </div>
    </AppShell>
  );
}
