'use client';

import { useMemo } from 'react';
import dynamic from 'next/dynamic';
import { cn } from '@/lib/shared/utils';
import { VisibilityGate } from '@/components/ui/visibility-gate';
import { IndicatorToggles } from '@/components/technical-analysis/indicator-toggles';
import { RefreshCw, LineChart, BarChart3 } from 'lucide-react';
import type { Candle, ChartTimeframe } from '@/types/chart';

/**
 * Lazy-load the candlestick chart shell along with its `lightweight-charts`
 * dependency. The chart is below the fold on first paint of the coin page
 * and only renders inside a VisibilityGate, so deferring the entire bundle
 * is safe and removes ~30-40 KB from the coin route's first-load JS.
 */
const CandlestickChart = dynamic(
  () => import('@/components/chart/candlestick-chart').then((m) => m.CandlestickChart),
  {
    ssr: false,
    loading: () => <ChartDeferredSkeleton />,
  }
);


type ChartMode = 'clean' | 'technical';

interface CoinChartSectionProps {
  candles: Candle[] | undefined;
  symbol: string;
  timeframe: ChartTimeframe;
  chartLoading: boolean;
  chartError: boolean;
  chartMode: ChartMode;
  onChartModeChange: (mode: ChartMode) => void;
  timeframes: ChartTimeframe[];
  onTimeframeChange: (tf: ChartTimeframe) => void;
  activeIndicators: Set<string>;
  onToggleIndicator: (key: string) => void;
}

/**
 * Chart section: timeframe selector, clean/technical toggle, indicator
 * toggles, and the candlestick chart itself.
 *
 * Owns the `activeIndicators` state because it is purely chart-local and
 * does not affect any other section of the page.
 */
export function CoinChartSection({
  candles,
  symbol,
  timeframe,
  chartLoading,
  chartError,
  chartMode,
  onChartModeChange,
  timeframes,
  onTimeframeChange,
  activeIndicators,
  onToggleIndicator,
}: CoinChartSectionProps) {

  const candleChartData = useMemo(() => {
    if (!candles || candles.length === 0) return [];
    return candles.map((c) => ({
      time: c.openTime,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
      volume: c.volume,
    }));
  }, [candles]);

  return (
    <div className="card overflow-hidden">
      {/* Chart Controls */}
      <div className="flex flex-wrap items-center gap-2 border-b border-border-subtle px-4 py-2.5">
        {/* Timeframe buttons */}
        <div className="flex items-center gap-1">
          {timeframes.map((tf) => (
            <button
              key={tf}
              onClick={() => onTimeframeChange(tf)}
              className={cn(
                'pressable rounded-md px-3 py-1.5 text-xs font-semibold transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring',
                timeframe === tf
                  ? 'bg-accent-primary/10 text-accent-primary shadow-[inset_0_0_0_1px_rgba(56,189,248,0.25)]'
                  : 'text-text-muted hover:bg-bg-surface-soft hover:text-text-secondary'
              )}
              aria-label={`Show ${tf} chart`}
              aria-pressed={timeframe === tf}
            >
              {tf}
            </button>
          ))}
        </div>

        {/* Status + Mode Toggle */}
        <div className="ml-auto flex items-center gap-2">
          {chartLoading && (
            <RefreshCw className="h-3.5 w-3.5 animate-spin text-text-muted" aria-label="Loading chart data" />
          )}
          {chartError && (
            <span
              className="text-xs font-medium text-warning"
              role="status"
              aria-label="Chart data unavailable"
            >
              Chart unavailable
            </span>
          )}

          {/* Clean / Technical Mode Toggle */}
          <div className="flex items-center gap-0.5 rounded-lg border border-border-subtle p-0.5">
            <button
              onClick={() => onChartModeChange('clean')}
              className={cn(
                'pressable flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition-all',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring',
                chartMode === 'clean'
                  ? 'bg-bg-surface-raised text-text-primary shadow-[inset_0_0_0_1px_rgba(56,189,248,0.18)]'
                  : 'text-text-muted hover:text-text-secondary'
              )}
              aria-pressed={chartMode === 'clean'}
            >
              <LineChart className="h-3 w-3" />
              Clean
            </button>
            <button
              onClick={() => onChartModeChange('technical')}
              className={cn(
                'pressable flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition-all',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring',
                chartMode === 'technical'
                  ? 'bg-accent-secondary/10 text-accent-secondary shadow-[inset_0_0_0_1px_rgba(139,92,246,0.3)]'
                  : 'text-text-muted hover:text-text-secondary'
              )}
              aria-pressed={chartMode === 'technical'}
            >
              <BarChart3 className="h-3 w-3" />
              Technical
            </button>
          </div>
        </div>
      </div>

      {/* Indicator Toggles — only in Technical Mode */}
      {chartMode === 'technical' && (
        <div className="border-b border-border-subtle/50 px-4 py-2">
          <IndicatorToggles active={activeIndicators} onToggle={onToggleIndicator} />
        </div>
      )}

      {/* Chart */}
      <div className="p-4">
        <VisibilityGate fallback={<ChartDeferredSkeleton />}>
          <CandlestickChart
            data={candleChartData}
            candles={chartMode === 'technical' ? candles : undefined}
            activeIndicators={chartMode === 'technical' ? activeIndicators : undefined}
            symbol={symbol}
            timeframe={timeframe}
          />
        </VisibilityGate>
      </div>
    </div>
  );
}

/** Skeleton shown while the chart is deferred behind IntersectionObserver. */
function ChartDeferredSkeleton() {
  return (
    <div className="flex h-[420px] items-center justify-center rounded-xl border border-border-subtle/60 bg-bg-surface-soft/40">
      <div className="text-center">
        <div className="skeleton mx-auto h-8 w-8 !rounded-full" />
        <p className="mt-3 text-xs font-medium uppercase tracking-wider text-text-muted">
          Preparing chart
        </p>
      </div>
    </div>
  );
}
