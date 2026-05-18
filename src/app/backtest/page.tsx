'use client';

import { AppShell } from '@/components/layout/app-shell';
import { BacktestPanel } from '@/components/backtest/backtest-panel';
import { HistoricalBacktestPanel } from '@/components/backtest/historical-backtest-panel';
import { PaperTradingPanel } from '@/components/backtest/paper-trading-panel';

/**
 * Backtest validation page.
 * Route: /backtest
 *
 * Three stacked panels, ordered from "most representative of live" to
 * "most reproducible":
 *   1. Historical Backtest — runs the live signal engine against real
 *      Binance USDⓈ-M Futures klines. Symbol, timeframe, depth, costs,
 *      max-hold, and conflict-resolution are tunable.
 *   2. Paper Trading — live status of signals submitted from the Futures
 *      panel with `source: 'paper'`. Outcomes derived from live ticks.
 *   3. Engine Backtest (Fixtures) — deterministic fixture replay across
 *      the five canonical regimes for fast regression checks.
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
            Validate the futures signal engine three ways &mdash; against real Binance klines, against
            live paper-traded ticks, and against deterministic regime fixtures. Capital
            preservation beats inflated backtest numbers; warnings below are surfaced verbatim.
          </p>
        </div>

        <HistoricalBacktestPanel />
        <PaperTradingPanel />
        <BacktestPanel />
      </div>
    </AppShell>
  );
}
