'use client';

import { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { formatCurrency } from '@/lib/formatting';
import {
  toChartCandles,
  toVolumeData,
  toLineData,
  getPriceFormat,
  formatChartTime,
  type RawOhlcv,
  type ChartCandle,
} from '@/lib/chart/transform';
import { calculateSMA } from '@/lib/indicators/moving-average';
import type { ChartTimeframe, Candle } from '@/types/chart';
import type {
  IChartApi,
  ISeriesApi,
  UTCTimestamp,
  MouseEventParams,
  Time,
} from 'lightweight-charts';

interface CandlestickChartProps {
  /** Raw OHLCV rows used for rendering the candle series. */
  data: RawOhlcv[];
  /** Optional raw candles used to compute MA overlays in the same place data lives. */
  candles?: Candle[];
  /** Active indicator keys. Only MA7/MA25/MA99 affect the chart overlay layer. */
  activeIndicators?: Set<string>;
  symbol: string;
  timeframe: ChartTimeframe;
}

/**
 * Professional candlestick chart with volume overlay and MA lines.
 *
 * Architecture:
 * - Effect 1: Initialize / destroy chart instance (depends on timeframe).
 * - Effect 2: Apply candles + volume. Uses series.update() for the latest
 *   bar when possible to avoid the visual "blink" of a full setData on every
 *   incoming tick. Falls back to setData when the dataset shape changes
 *   (length differs, earlier bar mutated, ascending sort broken).
 * - Effect 3: Apply MA overlays based on activeIndicators.
 *
 * Data transformation lives in `@/lib/chart/transform` so this component
 * stays focused on chart lifecycle and presentation.
 */
export function CandlestickChart({
  data,
  candles,
  activeIndicators,
  symbol,
  timeframe,
}: CandlestickChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null);

  // MA overlay series, keyed by indicator name (MA7 / MA25 / MA99).
  const maSeriesRef = useRef<Map<string, ISeriesApi<'Line'>>>(new Map());

  // Snapshot of last applied candle list — used to decide between
  // incremental update() and a full setData() rebuild.
  const lastCandlesRef = useRef<ChartCandle[]>([]);

  const [status, setStatus] = useState<'loading' | 'ready' | 'error' | 'empty'>('loading');
  const [ohlcInfo, setOhlcInfo] = useState<
    { open: number; high: number; low: number; close: number; time: string } | null
  >(null);

  /** Memoize processed candle data so child effects share a stable reference. */
  const processedCandles = useMemo(() => toChartCandles(data), [data]);

  /** Memoize volume data derived from processed candles. */
  const volumeData = useMemo(
    () => toVolumeData(processedCandles, data),
    [processedCandles, data]
  );

  /**
   * Memoize MA overlays (MA7 / MA25 / MA99).
   * Only computed when raw candles are provided AND the toggle is on,
   * to avoid wasting cycles when the user disabled all MAs.
   */
  const maOverlays = useMemo(() => {
    if (!candles || candles.length === 0) return null;
    const wantMa7 = activeIndicators?.has('MA7') ?? false;
    const wantMa25 = activeIndicators?.has('MA25') ?? false;
    const wantMa99 = activeIndicators?.has('MA99') ?? false;
    if (!wantMa7 && !wantMa25 && !wantMa99) return null;

    return {
      MA7: wantMa7 ? toLineData(calculateSMA(candles, 7)) : [],
      MA25: wantMa25 ? toLineData(calculateSMA(candles, 25)) : [],
      MA99: wantMa99 ? toLineData(calculateSMA(candles, 99)) : [],
    };
  }, [candles, activeIndicators]);

  /**
   * Crosshair handler — updates OHLC info bar when hovering over a candle.
   * Extracted so the effect dependency stays narrow.
   */
  const handleCrosshairMove = useCallback(
    (param: MouseEventParams<Time>, candleSeries: ISeriesApi<'Candlestick'>) => {
      if (!param.time || !param.seriesData) {
        setOhlcInfo(null);
        return;
      }

      const candleData = param.seriesData.get(candleSeries) as
        | { open?: number; high?: number; low?: number; close?: number }
        | undefined;

      if (candleData && candleData.open != null) {
        const timeValue = param.time as number;
        const date = new Date(timeValue * 1000);
        setOhlcInfo({
          open: candleData.open,
          high: candleData.high!,
          low: candleData.low!,
          close: candleData.close!,
          time: formatChartTime(date, timeframe),
        });
      } else {
        setOhlcInfo(null);
      }
    },
    [timeframe]
  );

  /**
   * Effect 1: Chart initialization and teardown.
   * Re-runs on timeframe change so the time scale config can be re-applied
   * cleanly (Lightweight Charts allows runtime updates, but recreating the
   * chart keeps the time axis ranges/labels predictable per timeframe).
   */
  useEffect(() => {
    let mounted = true;
    let resizeObserver: ResizeObserver | null = null;

    // Snapshot mutable ref to satisfy react-hooks/exhaustive-deps and to make
    // sure cleanup uses the SAME map instance the effect captured at mount.
    const maSeries = maSeriesRef.current;

    /**

     * Menjalankan logic init chart.

     * Dipakai untuk memisahkan tanggung jawab fungsi ini dari bagian aplikasi lain.

     */

    const initChart = async () => {
      try {
        const {
          createChart,
          ColorType,
          LineStyle,
          CandlestickSeries,
          HistogramSeries,
        } = await import('lightweight-charts');

        if (!mounted || !containerRef.current) return;

        // Tear down previous instance if any.
        if (chartRef.current) {
          chartRef.current.remove();
          chartRef.current = null;
          candleSeriesRef.current = null;
          volumeSeriesRef.current = null;
          maSeries.clear();
          lastCandlesRef.current = [];
        }

        const container = containerRef.current;
        const chart = createChart(container, {
          width: container.clientWidth,
          height: 420,
          layout: {
            background: { type: ColorType.Solid, color: 'transparent' },
            textColor: '#94a3b8',
            fontFamily: 'Inter, system-ui, sans-serif',
            fontSize: 11,
          },
          grid: {
            vertLines: { color: 'rgba(31, 41, 55, 0.3)', style: LineStyle.Dotted },
            horzLines: { color: 'rgba(31, 41, 55, 0.3)', style: LineStyle.Dotted },
          },
          crosshair: {
            mode: 0,
            vertLine: {
              color: 'rgba(56, 189, 248, 0.4)',
              width: 1,
              style: LineStyle.Dashed,
              labelBackgroundColor: '#1e293b',
            },
            horzLine: {
              color: 'rgba(56, 189, 248, 0.4)',
              width: 1,
              style: LineStyle.Dashed,
              labelBackgroundColor: '#1e293b',
            },
          },
          rightPriceScale: {
            borderColor: 'rgba(31, 41, 55, 0.5)',
            scaleMargins: { top: 0.05, bottom: 0.25 },
          },
          timeScale: {
            borderColor: 'rgba(31, 41, 55, 0.5)',
            timeVisible: true,
            secondsVisible: false,
            rightOffset: 5,
            barSpacing: 8,
            minBarSpacing: 4,
          },
          handleScroll: { vertTouchDrag: false },
          handleScale: { axisPressedMouseMove: true },
        });

        const candleSeries = chart.addSeries(CandlestickSeries, {
          upColor: '#22c55e',
          downColor: '#ef4444',
          borderVisible: false,
          wickUpColor: 'rgba(34, 197, 94, 0.8)',
          wickDownColor: 'rgba(239, 68, 68, 0.8)',
          priceLineVisible: true,
          lastValueVisible: true,
        });

        const volSeries = chart.addSeries(HistogramSeries, {
          priceFormat: { type: 'volume' },
          priceScaleId: 'volume',
        });

        chart.priceScale('volume').applyOptions({
          scaleMargins: { top: 0.8, bottom: 0 },
        });

        chart.subscribeCrosshairMove((param) => {
          if (!mounted) return;
          handleCrosshairMove(param, candleSeries);
        });

        resizeObserver = new ResizeObserver((entries) => {
          for (const entry of entries) {
            const { width } = entry.contentRect;
            if (chart && width > 0) {
              chart.applyOptions({ width });
            }
          }
        });
        resizeObserver.observe(container);

        chartRef.current = chart;
        candleSeriesRef.current = candleSeries;
        volumeSeriesRef.current = volSeries;

        if (mounted) setStatus('ready');
      } catch (error) {
        console.error('[CandlestickChart] Failed to initialize:', error);
        if (mounted) setStatus('error');
      }
    };

    setStatus('loading');
    void initChart();

    return () => {
      mounted = false;
      if (resizeObserver) resizeObserver.disconnect();
      if (chartRef.current) {
        chartRef.current.remove();
        chartRef.current = null;
        candleSeriesRef.current = null;
        volumeSeriesRef.current = null;
        maSeries.clear();
        lastCandlesRef.current = [];
      }
    };
  }, [timeframe, handleCrosshairMove]);

  /**
   * Effect 2: Apply candles + volume.
   *
   * Strategy:
   *  - If only the LAST bar changed (same length, same earlier bars),
   *    call `series.update()` on the latest candle. This is the realtime
   *    path and avoids the full-chart blink of `setData()`.
   *  - Otherwise (length changed, history mutated), fall back to `setData()`.
   */
  useEffect(() => {
    const candleSeries = candleSeriesRef.current;
    const volSeries = volumeSeriesRef.current;
    if (!candleSeries) return;

    if (processedCandles.length === 0) {
      setStatus('empty');
      return;
    }

    // Apply price format derived from latest close so precision adapts
    // to the coin magnitude (BTC vs SHIB).
    const latest = processedCandles[processedCandles.length - 1]!;
    const fmt = getPriceFormat(latest.close);
    candleSeries.applyOptions({
      priceFormat: { type: 'price', precision: fmt.precision, minMove: fmt.minMove },
    });

    const prev = lastCandlesRef.current;
    const sameLength = prev.length === processedCandles.length;
    const appendedOne = processedCandles.length === prev.length + 1;
    const previousBarsUnchanged = prev.length > 0 && isHistoryEqual(prev, processedCandles, prev.length);
    const canUpdateLatest =
      (sameLength && prev.length > 0 && isHistoryEqual(prev, processedCandles, prev.length - 1)) ||
      (appendedOne && previousBarsUnchanged);

    if (canUpdateLatest) {
      // Incremental tick or newly opened interval candle — update only the latest bar.
      candleSeries.update(latest);
      if (volSeries && volumeData.length > 0) {
        const latestVol = volumeData[volumeData.length - 1]!;
        volSeries.update(latestVol);
      }
    } else {
      // History changed (timeframe switch, full refresh, scroll back) — full reset.
      candleSeries.setData(processedCandles);
      if (volSeries) {
        volSeries.setData(volumeData);
      }
      // Refit only on full resets to avoid jumping during realtime ticks.
      chartRef.current?.timeScale().fitContent();
    }

    lastCandlesRef.current = processedCandles;
    setStatus('ready');
  }, [processedCandles, volumeData]);

  /**
   * Effect 3: Apply MA overlays.
   *
   * Lazily creates Line series the first time a given MA is enabled.
   * Removes the series when the indicator is toggled off so the
   * legend stays clean and we don't pay for unused series.
   */
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;

    let cancelled = false;
    /**
     * Menjalankan logic ensure series.
     * Dipakai untuk memisahkan tanggung jawab fungsi ini dari bagian aplikasi lain.
     */
    const ensureSeries = async () => {
      const lc = await import('lightweight-charts');
      if (cancelled || !chartRef.current) return;
      const { LineSeries } = lc;

      const desired: Record<string, { color: string; width: 1 | 2 | 3 | 4 }> = {
        MA7: { color: '#facc15', width: 1 },
        MA25: { color: '#38bdf8', width: 2 },
        MA99: { color: '#a78bfa', width: 2 },
      };

      // Toggle off any series that should no longer be displayed.
      for (const [key, series] of maSeriesRef.current.entries()) {
        const wanted = activeIndicators?.has(key) ?? false;
        if (!wanted) {
          chart.removeSeries(series);
          maSeriesRef.current.delete(key);
        }
      }

      if (!maOverlays) return;

      // Add or refresh series for each enabled MA.
      for (const key of Object.keys(desired)) {
        const wanted = activeIndicators?.has(key) ?? false;
        if (!wanted) continue;

        const points = maOverlays[key as 'MA7' | 'MA25' | 'MA99'];
        if (points.length === 0) continue;

        let series = maSeriesRef.current.get(key);
        if (!series) {
          series = chart.addSeries(LineSeries, {
            color: desired[key]!.color,
            lineWidth: desired[key]!.width,
            priceLineVisible: false,
            lastValueVisible: false,
            crosshairMarkerVisible: false,
          });
          maSeriesRef.current.set(key, series);
        }
        series.setData(points);
      }
    };

    void ensureSeries();
    return () => {
      cancelled = true;
    };
  }, [maOverlays, activeIndicators]);

  // Stats for accessibility.
  const lastCandle = data[data.length - 1];
  const highPrice = data.length > 0 ? Math.max(...data.map((d) => d.high)) : undefined;
  const lowPrice = data.length > 0 ? Math.min(...data.map((d) => d.low)) : undefined;

  return (
    <div className="relative">
      {/* OHLC Info Bar */}
      {status === 'ready' && (
        <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
          {ohlcInfo ? (
            <>
              <span className="text-text-muted">{ohlcInfo.time}</span>
              <OhlcItem label="O" value={ohlcInfo.open} prev={ohlcInfo.open} />
              <OhlcItem label="H" value={ohlcInfo.high} prev={ohlcInfo.open} />
              <OhlcItem label="L" value={ohlcInfo.low} prev={ohlcInfo.open} />
              <OhlcItem label="C" value={ohlcInfo.close} prev={ohlcInfo.open} />
            </>
          ) : lastCandle ? (
            <>
              <span className="text-text-muted">Latest</span>
              <OhlcItem label="O" value={lastCandle.open} prev={lastCandle.open} />
              <OhlcItem label="H" value={lastCandle.high} prev={lastCandle.open} />
              <OhlcItem label="L" value={lastCandle.low} prev={lastCandle.open} />
              <OhlcItem label="C" value={lastCandle.close} prev={lastCandle.open} />
            </>
          ) : null}

          {/* MA legend */}
          {maOverlays && (
            <div className="ml-auto flex items-center gap-3">
              {activeIndicators?.has('MA7') && (
                <LegendDot color="#facc15" label="MA7" />
              )}
              {activeIndicators?.has('MA25') && (
                <LegendDot color="#38bdf8" label="MA25" />
              )}
              {activeIndicators?.has('MA99') && (
                <LegendDot color="#a78bfa" label="MA99" />
              )}
            </div>
          )}
        </div>
      )}

      {/* Chart Container */}
      <div
        ref={containerRef}
        className={cn(
          'h-[420px] w-full rounded-lg',
          status === 'loading' && 'animate-pulse bg-bg-surface-raised',
          status === 'error' && 'flex items-center justify-center bg-bg-surface-raised',
          status === 'empty' && 'flex items-center justify-center bg-bg-surface-raised'
        )}
        role="img"
        aria-label={
          status === 'ready' && lastCandle
            ? `${symbol} candlestick chart, ${timeframe} timeframe. Last close ${formatCurrency(lastCandle.close)}. Period high ${formatCurrency(highPrice)}, low ${formatCurrency(lowPrice)}.`
            : `${symbol} candlestick chart is ${status}`
        }
      >
        {status === 'error' && (
          <div className="text-center">
            <p className="text-sm font-medium text-text-secondary">Chart unavailable</p>
            <p className="mt-1 text-xs text-text-muted">
              Unable to render chart. Try refreshing the page.
            </p>
          </div>
        )}
        {status === 'empty' && (
          <div className="text-center">
            <p className="text-sm font-medium text-text-secondary">No chart data</p>
            <p className="mt-1 text-xs text-text-muted">
              No valid {timeframe} candles are available for {symbol}.
            </p>
          </div>
        )}
      </div>

      {/* Footer */}
      {status === 'ready' && (
        <div className="mt-2 flex items-center justify-between text-[10px] text-text-muted">
          <span>
            {data.length} candles · {timeframe} per candle
          </span>
          <span>Source: Binance</span>
        </div>
      )}

      {/* Screen reader summary */}
      {status === 'ready' && lastCandle && (
        <p className="sr-only">
          {symbol} candlestick chart showing {data.length} candles at {timeframe} timeframe.
          Last close {formatCurrency(lastCandle.close)}. Period high {formatCurrency(highPrice)},
          low {formatCurrency(lowPrice)}.
        </p>
      )}
    </div>
  );
}

// --- Inline atoms ---

/**

 * Komponen OhlcItem untuk merender bagian UI terkait ohlc item.

 * Menjaga struktur tampilan tetap terpisah dari halaman atau komponen induk.

 */

function OhlcItem({ label, value, prev }: { label: string; value: number; prev: number }) {
  const isUp = value >= prev;
  return (
    <span className="inline-flex items-center gap-1">
      <span className="font-medium text-text-muted">{label}</span>
      <span className={cn('numeric font-semibold', isUp ? 'text-market-up' : 'text-market-down')}>
        {formatCurrency(value)}
      </span>
    </span>
  );
}

/**

 * Komponen LegendDot untuk merender bagian UI terkait legend dot.

 * Menjaga struktur tampilan tetap terpisah dari halaman atau komponen induk.

 */

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[10px] font-medium text-text-muted">
      <span
        aria-hidden
        className="inline-block h-1.5 w-3 rounded-sm"
        style={{ backgroundColor: color }}
      />
      {label}
    </span>
  );
}

// --- Helpers ---

/**
 * Compare two candle arrays up to (but not including) `until`.
 * Used to detect whether only the most recent bar changed so we can
 * pick the cheaper `series.update()` path.
 */
function isHistoryEqual(a: ChartCandle[], b: ChartCandle[], until: number): boolean {
  for (let i = 0; i < until; i++) {
    const ai = a[i]!;
    const bi = b[i]!;
    if (
      (ai.time as UTCTimestamp) !== (bi.time as UTCTimestamp) ||
      ai.open !== bi.open ||
      ai.high !== bi.high ||
      ai.low !== bi.low ||
      ai.close !== bi.close
    ) {
      return false;
    }
  }
  return true;
}
