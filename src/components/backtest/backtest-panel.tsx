'use client';

import { useMemo, useState } from 'react';
import { FlaskConical, AlertTriangle, TrendingUp, TrendingDown } from 'lucide-react';
import {
  bullishTrendFixture,
  bearishTrendFixture,
  rangeFixture,
  choppyFixture,
  volatileFixture,
  runBacktest,
  type BacktestMetrics,
  type BacktestResult,
  type FixtureName,
} from '@/lib/backtest';
import { cn } from '@/lib/utils';

/**
 * Backtest validation panel.
 *
 * Lets the user run the live signal engine against deterministic regime
 * fixtures and inspect the resulting Phase 2 metrics. The fixture buttons
 * cycle through every canonical regime so the user can validate the engine's
 * behavior end-to-end without depending on the live Binance API.
 */

const FIXTURE_LABELS: Record<FixtureName, string> = {
  bullish_trend: 'Bullish Trend',
  bearish_trend: 'Bearish Trend',
  range: 'Range',
  choppy: 'Choppy',
  volatile: 'Volatile',
};

const FIXTURE_FNS: Record<FixtureName, (count?: number) => ReturnType<typeof bullishTrendFixture>> = {
  bullish_trend: bullishTrendFixture,
  bearish_trend: bearishTrendFixture,
  range: rangeFixture,
  choppy: choppyFixture,
  volatile: volatileFixture,
};

export function BacktestPanel() {
  const [activeFixture, setActiveFixture] = useState<FixtureName>('bullish_trend');
  const [busy, setBusy] = useState(false);

  const result = useMemo<BacktestResult>(() => {
    const candles = FIXTURE_FNS[activeFixture](300);
    return runBacktest({ symbol: 'TEST', timeframe: '30m', candles });
  }, [activeFixture]);

  const m = result.metrics;

  return (
    <section className="card space-y-4 px-4 py-4" aria-labelledby="backtest-panel-title">
      <header className="flex items-center justify-between">
        <h2
          id="backtest-panel-title"
          className="flex items-center gap-2 font-[family-name:var(--font-display)] text-sm font-semibold uppercase tracking-wider text-text-muted"
        >
          <FlaskConical className="h-3.5 w-3.5" />
          Engine Backtest
        </h2>
        <span className="text-[10px] font-medium uppercase tracking-wider text-text-muted">
          Deterministic fixtures
        </span>
      </header>

      <p className="text-xs text-text-muted">
        Run the live signal engine against synthetic candles representing each canonical regime.
        Outputs are fully reproducible. Trades are simulated with conservative fills (SL wins on
        same-bar conflicts), 0.04% taker fees, and 0.05% slippage per side.
      </p>

      <div className="flex flex-wrap gap-1.5">
        {(Object.keys(FIXTURE_LABELS) as FixtureName[]).map((key) => (
          <button
            key={key}
            onClick={() => {
              setBusy(true);
              setActiveFixture(key);
              // useMemo will recompute synchronously; the busy flag exists so future
              // long-running runs can show a spinner without restructuring the panel.
              queueMicrotask(() => setBusy(false));
            }}
            className={cn(
              'rounded-md border px-2.5 py-1 text-[11px] font-medium transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring',
              activeFixture === key
                ? 'border-accent-primary/40 bg-accent-primary/10 text-accent-primary'
                : 'border-border-subtle bg-bg-surface-raised text-text-secondary hover:text-text-primary'
            )}
            aria-pressed={activeFixture === key}
          >
            {FIXTURE_LABELS[key]}
          </button>
        ))}
        {busy && <span className="text-[10px] text-text-muted">running…</span>}
      </div>

      {/* Headline metrics */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <Metric label="Signals" value={m.totalSignals.toString()} />
        <Metric label="Trades" value={m.totalTrades.toString()} />
        <Metric label="Wait Rate" value={`${m.waitRate.toFixed(0)}%`} />
        <Metric
          label="Win Rate"
          value={`${m.winRate.toFixed(1)}%`}
          tone={m.winRate >= 50 ? 'bullish' : 'bearish'}
        />
        <Metric
          label="Expectancy"
          value={`${formatR(m.expectancyR)}R`}
          tone={m.expectancyR > 0 ? 'bullish' : 'bearish'}
        />
        <Metric
          label="Max DD"
          value={`${m.maxDrawdownR.toFixed(2)}R`}
          tone="bearish"
        />
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Metric label="Avg R" value={`${formatR(m.averageR)}R`} />
        <Metric
          label="Profit Factor"
          value={Number.isFinite(m.profitFactor) ? m.profitFactor.toFixed(2) : '\u221e'}
          tone={Number.isFinite(m.profitFactor) ? (m.profitFactor >= 1 ? 'bullish' : 'bearish') : 'bullish'}
        />
        <Metric label="Loss Streak" value={m.maxLosingStreak.toString()} />
        <Metric label="Avg Hold" value={`${m.averageHoldCandles.toFixed(0)} bars`} />
      </div>

      {/* Best / worst setup */}
      <div className="grid gap-2 sm:grid-cols-2">
        <SetupCard label="Best Setup" setup={m.bestSetupType} tone="bullish" />
        <SetupCard label="Worst Setup" setup={m.worstSetupType} tone="bearish" />
      </div>

      {/* Performance buckets */}
      <div className="space-y-2">
        <h3 className="text-[10px] font-semibold uppercase tracking-wider text-text-muted">
          Performance by Regime
        </h3>
        <BucketTable buckets={m.performanceByRegime} />
      </div>

      {/* Warnings */}
      {result.warnings.length > 0 && (
        <div className="space-y-1.5 rounded-lg border border-yellow-500/30 bg-yellow-500/5 px-3 py-2.5">
          {result.warnings.map((warning) => (
            <div key={warning} className="flex items-start gap-2 text-[11px] text-yellow-300">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
              <span>{warning}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function Metric({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: 'bullish' | 'bearish';
}) {
  return (
    <div className="rounded-md border border-border-subtle bg-bg-surface-soft px-2 py-1.5">
      <p className="text-[10px] font-medium uppercase tracking-wider text-text-muted">{label}</p>
      <p
        className={cn(
          'numeric mt-0.5 text-sm font-semibold',
          tone === 'bullish' && 'text-market-up',
          tone === 'bearish' && 'text-market-down',
          !tone && 'text-text-primary'
        )}
      >
        {value}
      </p>
    </div>
  );
}

function SetupCard({
  label,
  setup,
  tone,
}: {
  label: string;
  setup: BacktestMetrics['bestSetupType'];
  tone: 'bullish' | 'bearish';
}) {
  return (
    <div className="rounded-lg border border-border-subtle bg-bg-surface-soft px-3 py-2.5">
      <div className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wider text-text-muted">
        {tone === 'bullish' ? (
          <TrendingUp className="h-3 w-3" />
        ) : (
          <TrendingDown className="h-3 w-3" />
        )}
        {label}
      </div>
      <p
        className={cn(
          'mt-1 text-sm font-semibold',
          tone === 'bullish' && 'text-market-up',
          tone === 'bearish' && 'text-market-down'
        )}
      >
        {setup ? setup.replace(/_/g, ' ') : '\u2014 (insufficient samples)'}
      </p>
    </div>
  );
}

function BucketTable({
  buckets,
}: {
  buckets: BacktestMetrics['performanceByRegime'];
}) {
  const rows = Object.entries(buckets);
  if (rows.length === 0) {
    return (
      <p className="text-[11px] text-text-muted">No trades in this run.</p>
    );
  }
  return (
    <div className="overflow-hidden rounded-lg border border-border-subtle">
      <table className="w-full text-[11px]">
        <thead className="bg-bg-surface-raised text-[10px] uppercase tracking-wider text-text-muted">
          <tr>
            <th className="px-2 py-1.5 text-left font-medium">Bucket</th>
            <th className="px-2 py-1.5 text-right font-medium">Count</th>
            <th className="px-2 py-1.5 text-right font-medium">Win %</th>
            <th className="px-2 py-1.5 text-right font-medium">Avg R</th>
            <th className="px-2 py-1.5 text-right font-medium">Total R</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([key, b]) => (
            <tr key={key} className="border-t border-border-subtle/60">
              <td className="px-2 py-1.5 font-medium text-text-secondary">
                {key.replace(/_/g, ' ')}
              </td>
              <td className="numeric px-2 py-1.5 text-right text-text-primary">{b.count}</td>
              <td
                className={cn(
                  'numeric px-2 py-1.5 text-right',
                  b.winRate >= 50 ? 'text-market-up' : 'text-market-down'
                )}
              >
                {b.winRate.toFixed(0)}%
              </td>
              <td
                className={cn(
                  'numeric px-2 py-1.5 text-right',
                  b.averageR > 0 ? 'text-market-up' : 'text-market-down'
                )}
              >
                {formatR(b.averageR)}
              </td>
              <td
                className={cn(
                  'numeric px-2 py-1.5 text-right',
                  b.totalR > 0 ? 'text-market-up' : 'text-market-down'
                )}
              >
                {formatR(b.totalR)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function formatR(v: number): string {
  if (!Number.isFinite(v)) return '\u221e';
  return v >= 0 ? `+${v.toFixed(2)}` : v.toFixed(2);
}
