import { describe, expect, it } from 'vitest';
import { buildPriceChangeAriaLabel } from '../price-change-label';

/**
 * Tests for the shared price-change aria-label builder.
 *
 * The label is read by assistive tech as a sentence, so we are strict about
 * direction wording and the absence path.
 */
describe('buildPriceChangeAriaLabel', () => {
  it('formats positive change as "up <magnitude>"', () => {
    expect(buildPriceChangeAriaLabel('BTC', 2.5)).toBe('BTC up 2.50%');
  });

  it('formats negative change as "down <magnitude>" with no sign', () => {
    expect(buildPriceChangeAriaLabel('ETH', -1.1)).toBe('ETH down 1.10%');
  });

  it('formats zero as "unchanged 0.00%"', () => {
    expect(buildPriceChangeAriaLabel('SOL', 0)).toBe('SOL unchanged 0.00%');
  });

  it('returns the unavailable variant when value is null', () => {
    expect(buildPriceChangeAriaLabel('BTC', null)).toBe('BTC 24-hour change unavailable');
  });

  it('returns the unavailable variant when value is undefined', () => {
    expect(buildPriceChangeAriaLabel('BTC', undefined)).toBe('BTC 24-hour change unavailable');
  });

  it('returns the unavailable variant when value is NaN', () => {
    expect(buildPriceChangeAriaLabel('BTC', Number.NaN)).toBe('BTC 24-hour change unavailable');
  });

  it('returns the unavailable variant when value is Infinity', () => {
    // Division-by-zero upstream can yield non-finite values. The helper drops
    // these instead of announcing "Infinity%" to a screen reader.
    expect(buildPriceChangeAriaLabel('BTC', Number.POSITIVE_INFINITY)).toBe('BTC 24-hour change unavailable');
    expect(buildPriceChangeAriaLabel('BTC', Number.NEGATIVE_INFINITY)).toBe('BTC 24-hour change unavailable');
  });

  it('preserves the symbol verbatim so consumers can pass display labels too', () => {
    expect(buildPriceChangeAriaLabel('Total P/L', 3.42)).toBe('Total P/L up 3.42%');
  });
});
