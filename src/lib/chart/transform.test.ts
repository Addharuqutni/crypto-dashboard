import { describe, it, expect } from 'vitest';
import {
  toChartCandles,
  toVolumeData,
  toLineData,
  getPriceFormat,
  formatChartTime,
  type RawOhlcv,
} from './transform';
import type { UTCTimestamp } from 'lightweight-charts';

/**
 * Helper to build an OHLCV row with realistic defaults.
 * Reduces repetition across tests and keeps intent obvious.
 */
function ohlcv(partial: Partial<RawOhlcv> & { time: number }): RawOhlcv {
  return {
    open: 100,
    high: 110,
    low: 90,
    close: 105,
    volume: 1000,
    ...partial,
  };
}

describe('toChartCandles', () => {
  it('returns an empty array when input is empty', () => {
    expect(toChartCandles([])).toEqual([]);
  });

  it('converts millisecond timestamps to UTC seconds', () => {
    const result = toChartCandles([ohlcv({ time: 1_700_000_000_000 })]);
    expect(result).toHaveLength(1);
    expect(result[0]!.time).toBe(1_700_000_000);
  });

  it('filters out rows with non-positive prices', () => {
    const result = toChartCandles([
      ohlcv({ time: 1_700_000_000_000, open: 0 }),
      ohlcv({ time: 1_700_000_060_000, low: -1 }),
      ohlcv({ time: 1_700_000_120_000 }),
    ]);
    expect(result).toHaveLength(1);
    expect(result[0]!.time).toBe(1_700_000_120);
  });

  it('filters out rows with non-finite values', () => {
    const result = toChartCandles([
      ohlcv({ time: 1_700_000_000_000, high: Number.NaN }),
      ohlcv({ time: 1_700_000_060_000, close: Number.POSITIVE_INFINITY }),
      ohlcv({ time: 1_700_000_120_000 }),
    ]);
    expect(result).toHaveLength(1);
    expect(result[0]!.time).toBe(1_700_000_120);
  });

  it('sorts candles ascending by time even when input is shuffled', () => {
    const result = toChartCandles([
      ohlcv({ time: 1_700_000_120_000 }),
      ohlcv({ time: 1_700_000_000_000 }),
      ohlcv({ time: 1_700_000_060_000 }),
    ]);
    expect(result.map((c) => c.time)).toEqual([
      1_700_000_000,
      1_700_000_060,
      1_700_000_120,
    ]);
  });

  it('deduplicates by timestamp keeping the last occurrence', () => {
    const result = toChartCandles([
      ohlcv({ time: 1_700_000_000_000, close: 100 }),
      ohlcv({ time: 1_700_000_000_000, close: 200 }),
    ]);
    expect(result).toHaveLength(1);
    expect(result[0]!.close).toBe(200);
  });

  it('produces valid UTCTimestamp values that can be passed to series.update', () => {
    const result = toChartCandles([ohlcv({ time: 1_700_000_000_000 })]);
    const t: UTCTimestamp = result[0]!.time;
    expect(typeof t).toBe('number');
    expect(t).toBe(1_700_000_000);
  });
});

describe('toVolumeData', () => {
  it('returns empty array when no row has positive volume', () => {
    const processed = toChartCandles([ohlcv({ time: 1_700_000_000_000, volume: 0 })]);
    const raw = [ohlcv({ time: 1_700_000_000_000, volume: 0 })];
    expect(toVolumeData(processed, raw)).toEqual([]);
  });

  it('returns empty array when processed candles are empty', () => {
    expect(toVolumeData([], [ohlcv({ time: 1, volume: 5 })])).toEqual([]);
  });

  it('colors up-bars green and down-bars red', () => {
    const raw = [
      ohlcv({ time: 1_700_000_000_000, open: 100, close: 110, volume: 50 }),
      ohlcv({ time: 1_700_000_060_000, open: 110, close: 90, volume: 80 }),
    ];
    const processed = toChartCandles(raw);
    const volumes = toVolumeData(processed, raw);

    expect(volumes).toHaveLength(2);
    expect(volumes[0]!.color).toContain('34, 197, 94'); // green
    expect(volumes[1]!.color).toContain('239, 68, 68'); // red
  });

  it('aligns volume by timestamp instead of array index', () => {
    const raw = [
      ohlcv({ time: 1_700_000_120_000, volume: 200 }),
      ohlcv({ time: 1_700_000_000_000, volume: 100 }),
    ];
    const processed = toChartCandles(raw);
    const volumes = toVolumeData(processed, raw);

    expect(volumes[0]!.value).toBe(100);
    expect(volumes[1]!.value).toBe(200);
  });
});

describe('toLineData', () => {
  it('returns empty array for empty input', () => {
    expect(toLineData([])).toEqual([]);
  });

  it('filters out non-finite or non-positive timestamps', () => {
    const result = toLineData([
      { time: 1_700_000_000_000, value: 1 },
      { time: 0, value: 2 },
      { time: 1_700_000_060_000, value: Number.NaN },
      { time: 1_700_000_120_000, value: 3 },
    ]);
    expect(result).toHaveLength(2);
    expect(result[0]!.value).toBe(1);
    expect(result[1]!.value).toBe(3);
  });

  it('converts ms to seconds and sorts ascending', () => {
    const result = toLineData([
      { time: 1_700_000_120_000, value: 3 },
      { time: 1_700_000_000_000, value: 1 },
    ]);
    expect(result.map((p) => p.time)).toEqual([1_700_000_000, 1_700_000_120]);
  });
});

describe('getPriceFormat', () => {
  it('uses 2 decimals for large-cap prices >= 1000', () => {
    expect(getPriceFormat(50_000)).toEqual({ precision: 2, minMove: 0.01 });
  });

  it('uses 4 decimals for prices in [1, 1000)', () => {
    expect(getPriceFormat(50)).toEqual({ precision: 4, minMove: 0.0001 });
  });

  it('uses 6 decimals for prices in [0.01, 1)', () => {
    expect(getPriceFormat(0.5)).toEqual({ precision: 6, minMove: 0.000001 });
  });

  it('uses 8 decimals for micro-cap prices < 0.01', () => {
    expect(getPriceFormat(0.000_001)).toEqual({ precision: 8, minMove: 0.00000001 });
  });
});

describe('formatChartTime', () => {
  it('returns datetime label for intraday timeframes', () => {
    const date = new Date('2024-01-15T10:30:00Z');
    const out = formatChartTime(date, '1H');
    // We don't assert exact locale output (varies by environment),
    // but it must contain time-of-day separator info beyond just date.
    expect(out).toMatch(/\d{2}:\d{2}/);
  });

  it('returns date-only label for daily timeframes', () => {
    const date = new Date('2024-01-15T10:30:00Z');
    const out = formatChartTime(date, '24H');
    expect(out).not.toMatch(/\d{2}:\d{2}/);
  });
});
