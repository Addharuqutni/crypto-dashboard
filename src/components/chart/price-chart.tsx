'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { formatCurrency } from '@/lib/formatting';
import { toLineData, getPriceFormat } from '@/lib/chart/transform';
import type { ChartTimeframe } from '@/types/chart';
import type { IChartApi, ISeriesApi } from 'lightweight-charts';

interface PriceChartProps {
  /** Time-series points in milliseconds (Binance native). */
  data: { time: number; value: number }[];
  symbol: string;
  timeframe: ChartTimeframe;
}

/**
 * Compact price chart used on cards and quick previews.
 *
 * Architecture mirrors CandlestickChart:
 * - Effect 1: chart init/teardown, depends on `timeframe` only.
 * - Effect 2: data application, depends on processed line points.
 *
 * This keeps the chart instance stable across data refreshes and avoids
 * re-creating the canvas on every TanStack Query refetch.
 */
export function PriceChart({ data, symbol, timeframe }: PriceChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<'Area'> | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error' | 'empty'>('loading');

  /** Memoize chart-ready line points so the data effect has a stable input. */
  const chartData = useMemo(() => toLineData(data), [data]);

  /**
   * Effect 1: initialize chart and observe container size.
   * Re-runs only when timeframe changes so axis configs reset cleanly.
   */
  useEffect(() => {
    let mounted = true;
    let resizeObserver: ResizeObserver | null = null;

    const initChart = async () => {
      try {
        const { createChart, ColorType, LineStyle, AreaSeries } = await import(
          'lightweight-charts'
        );

        if (!mounted || !containerRef.current) return;

        // Tear down any previous instance.
        if (chartRef.current) {
          chartRef.current.remove();
          chartRef.current = null;
          seriesRef.current = null;
        }

        const container = containerRef.current;
        const chart = createChart(container, {
          width: container.clientWidth,
          height: 320,
          layout: {
            background: { type: ColorType.Solid, color: 'transparent' },
            textColor: '#a7b0c0',
            fontFamily: 'Inter, system-ui, sans-serif',
            fontSize: 11,
          },
          grid: {
            vertLines: { color: 'rgba(31, 41, 55, 0.5)' },
            horzLines: { color: 'rgba(31, 41, 55, 0.5)' },
          },
          crosshair: {
            vertLine: { color: '#38bdf8', width: 1, style: LineStyle.Dashed },
            horzLine: { color: '#38bdf8', width: 1, style: LineStyle.Dashed },
          },
          rightPriceScale: { borderColor: '#1f2937' },
          timeScale: {
            borderColor: '#1f2937',
            timeVisible: true,
            secondsVisible: false,
          },
          handleScroll: { vertTouchDrag: false },
        });

        const series = chart.addSeries(AreaSeries, {
          lineColor: '#38bdf8',
          topColor: 'rgba(56, 189, 248, 0.15)',
          bottomColor: 'rgba(56, 189, 248, 0.01)',
          lineWidth: 2,
        });

        chartRef.current = chart;
        seriesRef.current = series;

        resizeObserver = new ResizeObserver((entries) => {
          for (const entry of entries) {
            const { width } = entry.contentRect;
            if (width > 0) chart.applyOptions({ width });
          }
        });
        resizeObserver.observe(container);
      } catch (error) {
        console.error('[PriceChart] Failed to initialize:', error);
        if (mounted) setStatus('error');
      }
    };

    void initChart();

    return () => {
      mounted = false;
      if (resizeObserver) resizeObserver.disconnect();
      if (chartRef.current) {
        chartRef.current.remove();
        chartRef.current = null;
        seriesRef.current = null;
      }
    };
  }, [timeframe]);

  /**
   * Effect 2: apply data and price format.
   * Skips re-init when only the points change — keeps the canvas stable.
   */
  useEffect(() => {
    const series = seriesRef.current;
    if (!series) return;

    if (chartData.length === 0) {
      setStatus('empty');
      return;
    }

    const latestValue = chartData[chartData.length - 1]!.value;
    const fmt = getPriceFormat(latestValue);
    series.applyOptions({
      priceFormat: { type: 'price', precision: fmt.precision, minMove: fmt.minMove },
    });
    series.setData(chartData);
    chartRef.current?.timeScale().fitContent();
    setStatus('ready');
  }, [chartData]);

  // Accessibility fallback summary text.
  const lastPrice = data[data.length - 1]?.value;
  const highPrice = data.length > 0 ? Math.max(...data.map((d) => d.value)) : undefined;
  const lowPrice = data.length > 0 ? Math.min(...data.map((d) => d.value)) : undefined;

  return (
    <div className="relative">
      <div
        ref={containerRef}
        className={cn(
          'h-[320px] w-full',
          status === 'loading' && 'animate-pulse rounded-lg bg-bg-surface-raised',
          status === 'error' && 'flex items-center justify-center rounded-lg bg-bg-surface-raised',
          status === 'empty' && 'flex items-center justify-center rounded-lg bg-bg-surface-raised'
        )}
        role="img"
        aria-label={
          status === 'ready' && lastPrice
            ? `${symbol} price chart for the last ${timeframe}. Current price is ${formatCurrency(lastPrice)}. Highest was ${formatCurrency(highPrice)} and lowest was ${formatCurrency(lowPrice)}.`
            : `${symbol} price chart is ${status}`
        }
      >
        {status === 'error' && (
          <div className="text-center">
            <p className="text-sm font-medium text-text-secondary">Chart unavailable</p>
            <p className="mt-1 text-xs text-text-muted">
              Unable to render chart. Price data is still shown above.
            </p>
          </div>
        )}
        {status === 'empty' && (
          <div className="text-center">
            <p className="text-sm font-medium text-text-secondary">No chart data</p>
            <p className="mt-1 text-xs text-text-muted">
              Insufficient data for the selected timeframe.
            </p>
          </div>
        )}
      </div>

      {status === 'ready' && lastPrice && (
        <p className="sr-only">
          {symbol} price chart for the last {timeframe}. Current price is{' '}
          {formatCurrency(lastPrice)}. Highest price was {formatCurrency(highPrice)} and lowest
          price was {formatCurrency(lowPrice)}.
        </p>
      )}
    </div>
  );
}
