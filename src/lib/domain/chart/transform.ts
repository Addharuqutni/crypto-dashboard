import type { UTCTimestamp } from 'lightweight-charts';
import type { ChartTimeframe } from '@/types/chart';

/**
 * OHLCV row used by the candlestick chart component.
 * Time is in milliseconds (Binance native format).
 */
export type RawOhlcv = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
};

/**
 * Candle row in Lightweight Charts native format.
 * Time is in seconds (UTCTimestamp).
 */
export type ChartCandle = {
  time: UTCTimestamp;
  open: number;
  high: number;
  low: number;
  close: number;
};

/**
 * Volume histogram bar used by the candlestick chart.
 * Color is derived from candle direction (up/down).
 */
export type ChartVolumeBar = {
  time: UTCTimestamp;
  value: number;
  color: string;
};

/**
 * Line point for MA / indicator overlays.
 */
export type ChartLinePoint = {
  time: UTCTimestamp;
  value: number;
};

/**
 * Convert raw Binance OHLCV rows into Lightweight Charts candle format.
 * Performs:
 *  1. Filter rows with invalid (non-positive) values.
 *  2. Convert ms timestamps to UTCTimestamp seconds.
 *  3. Sort ascending by time.
 *  4. Deduplicate by timestamp (keep latest).
 *
 * Lightweight Charts requires sorted, deduplicated data — passing dirty
 * data leads to runtime errors or visual glitches.
 */
export function toChartCandles(data: RawOhlcv[]): ChartCandle[] {
  if (!data || data.length === 0) return [];

  const converted = data
    .filter(
      (d) =>
        Number.isFinite(d.open) &&
        Number.isFinite(d.high) &&
        Number.isFinite(d.low) &&
        Number.isFinite(d.close) &&
        d.open > 0 &&
        d.high > 0 &&
        d.low > 0 &&
        d.close > 0 &&
        d.time > 0
    )
    .map<ChartCandle>((d) => ({
      time: Math.floor(d.time / 1000) as UTCTimestamp,
      open: d.open,
      high: d.high,
      low: d.low,
      close: d.close,
    }))
    .sort((a, b) => (a.time as number) - (b.time as number));

  // Deduplicate by timestamp — keep last entry to honor latest tick.
  const deduped = new Map<number, ChartCandle>();
  for (const candle of converted) {
    deduped.set(candle.time as number, candle);
  }
  return Array.from(deduped.values());
}

/**
 * Build volume histogram bars matching the processed candle list.
 * Returns an empty array when no row has a positive volume so the
 * caller can hide the volume series instead of rendering empty bars.
 */
export function toVolumeData(processed: ChartCandle[], raw: RawOhlcv[]): ChartVolumeBar[] {
  if (processed.length === 0) return [];
  const hasVolume = raw.some((d) => typeof d.volume === 'number' && d.volume > 0);
  if (!hasVolume) return [];

  // Build a quick lookup from converted timestamp → raw volume.
  const volumeByTime = new Map<number, number>();
  for (const r of raw) {
    if (!Number.isFinite(r.time) || r.time <= 0) continue;
    const t = Math.floor(r.time / 1000);
    volumeByTime.set(t, r.volume ?? 0);
  }

  return processed.map((candle) => {
    const isUp = candle.close >= candle.open;
    return {
      time: candle.time,
      value: volumeByTime.get(candle.time as number) ?? 0,
      color: isUp ? 'rgba(34, 197, 94, 0.25)' : 'rgba(239, 68, 68, 0.25)',
    };
  });
}

/**
 * Convert MA / indicator points to Lightweight Charts line format.
 * MA outputs internally use ms timestamps; charts expect seconds.
 */
export function toLineData(points: { time: number; value: number }[]): ChartLinePoint[] {
  if (!points || points.length === 0) return [];
  return points
    .filter((p) => Number.isFinite(p.value) && p.time > 0)
    .map<ChartLinePoint>((p) => ({
      time: Math.floor(p.time / 1000) as UTCTimestamp,
      value: p.value,
    }))
    .sort((a, b) => (a.time as number) - (b.time as number));
}

/**
 * Resolve appropriate price format precision/minMove based on price magnitude.
 * Crypto prices span 8 orders of magnitude, so a single precision is unusable.
 */
export function getPriceFormat(price: number): { precision: number; minMove: number } {
  if (price >= 1000) return { precision: 2, minMove: 0.01 };
  if (price >= 1) return { precision: 4, minMove: 0.0001 };
  if (price >= 0.01) return { precision: 6, minMove: 0.000001 };
  return { precision: 8, minMove: 0.00000001 };
}

/**
 * Format a chart timestamp for the crosshair OHLC info bar.
 * Uses date-only labels for daily+ timeframes, datetime for intraday.
 */
export function formatChartTime(date: Date, timeframe: ChartTimeframe): string {
  switch (timeframe) {
    case '5m':
    case '15m':
    case '30m':
    case '1H':
    case '4H':
      return date.toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      });
    case '24H':
    case '7D':
    case '30D':
      return date.toLocaleString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      });
  }
}
