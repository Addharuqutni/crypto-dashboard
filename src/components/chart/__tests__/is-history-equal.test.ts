import { describe, it, expect } from 'vitest';
import { isHistoryEqual } from '../candlestick-chart';
import type { ChartCandle } from '@/lib/domain/chart/transform';
import type { UTCTimestamp } from 'lightweight-charts';

function candle(time: number, o: number, h: number, l: number, c: number): ChartCandle {
  return { time: time as UTCTimestamp, open: o, high: h, low: l, close: c };
}

describe('isHistoryEqual', () => {
  it('returns true for identical arrays', () => {
    const a = [candle(1, 10, 20, 5, 15), candle(2, 15, 25, 10, 20)];
    const b = [candle(1, 10, 20, 5, 15), candle(2, 15, 25, 10, 20)];
    expect(isHistoryEqual(a, b, 2)).toBe(true);
  });

  it('returns false when time differs', () => {
    const a = [candle(1, 10, 20, 5, 15)];
    const b = [candle(2, 10, 20, 5, 15)];
    expect(isHistoryEqual(a, b, 1)).toBe(false);
  });

  it('returns false when open differs', () => {
    const a = [candle(1, 10, 20, 5, 15)];
    const b = [candle(1, 11, 20, 5, 15)];
    expect(isHistoryEqual(a, b, 1)).toBe(false);
  });

  it('returns false when high differs', () => {
    const a = [candle(1, 10, 20, 5, 15)];
    const b = [candle(1, 10, 21, 5, 15)];
    expect(isHistoryEqual(a, b, 1)).toBe(false);
  });

  it('returns false when low differs', () => {
    const a = [candle(1, 10, 20, 5, 15)];
    const b = [candle(1, 10, 20, 6, 15)];
    expect(isHistoryEqual(a, b, 1)).toBe(false);
  });

  it('returns false when close differs', () => {
    const a = [candle(1, 10, 20, 5, 15)];
    const b = [candle(1, 10, 20, 5, 16)];
    expect(isHistoryEqual(a, b, 1)).toBe(false);
  });

  it('returns true when until is 0 (no comparison)', () => {
    const a = [candle(1, 10, 20, 5, 15)];
    const b = [candle(2, 99, 99, 99, 99)];
    expect(isHistoryEqual(a, b, 0)).toBe(true);
  });

  it('only compares prefix up to until', () => {
    const a = [candle(1, 10, 20, 5, 15), candle(2, 99, 99, 99, 99)];
    const b = [candle(1, 10, 20, 5, 15), candle(2, 1, 1, 1, 1)];
    expect(isHistoryEqual(a, b, 1)).toBe(true);
  });

  it('returns true for empty arrays with until 0', () => {
    expect(isHistoryEqual([], [], 0)).toBe(true);
  });
});
