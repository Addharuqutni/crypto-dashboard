import { describe, expect, it } from 'vitest';
import { formatPercentageMagnitude } from '../index';

/**
 * Tests for the magnitude-only percentage formatter.
 * Pairs with `formatPercentage` (signed) but strips the sign so it can be
 * read after directional words like "up" / "down" without doubling them up.
 */
describe('formatPercentageMagnitude', () => {
  it('strips the sign for positive numbers', () => {
    expect(formatPercentageMagnitude(2.5)).toBe('2.50%');
  });

  it('strips the sign for negative numbers', () => {
    expect(formatPercentageMagnitude(-2.5)).toBe('2.50%');
  });

  it('returns 0.00% for zero', () => {
    expect(formatPercentageMagnitude(0)).toBe('0.00%');
  });

  it('returns em dash for null', () => {
    expect(formatPercentageMagnitude(null)).toBe('—');
  });

  it('returns em dash for undefined', () => {
    expect(formatPercentageMagnitude(undefined)).toBe('—');
  });

  it('returns em dash for NaN', () => {
    expect(formatPercentageMagnitude(Number.NaN)).toBe('—');
  });

  it('honours the decimals override', () => {
    expect(formatPercentageMagnitude(-1.2345, 1)).toBe('1.2%');
    expect(formatPercentageMagnitude(1.2345, 4)).toBe('1.2345%');
  });

  it('handles very small magnitudes without losing precision at default decimals', () => {
    expect(formatPercentageMagnitude(-0.004)).toBe('0.00%');
    expect(formatPercentageMagnitude(-0.005)).toBe('0.01%');
  });
});
