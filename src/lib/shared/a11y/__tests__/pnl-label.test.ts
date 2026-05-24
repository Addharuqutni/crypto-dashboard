import { describe, expect, it } from 'vitest';
import { buildPnlAriaLabel } from '../pnl-label';

/**
 * Tests for the PnL aria-label builder.
 *
 * Sign is dropped from both currency and percentage; direction word carries
 * polarity. Missing `pnl` falls back to a graceful "unavailable" sentence.
 */
describe('buildPnlAriaLabel', () => {
  it('formats profit with both currency and percentage stripped of sign', () => {
    expect(buildPnlAriaLabel(123.45, 4.2)).toBe('Profit and loss up $123.45 (4.20%)');
  });

  it('formats loss with both magnitudes unsigned', () => {
    expect(buildPnlAriaLabel(-123.45, -4.2)).toBe('Profit and loss down $123.45 (4.20%)');
  });

  it('formats break-even as unchanged', () => {
    expect(buildPnlAriaLabel(0, 0)).toBe('Profit and loss unchanged $0.00 (0.00%)');
  });

  it('omits the percentage parenthetical when pnlPercent is null', () => {
    expect(buildPnlAriaLabel(50, null)).toBe('Profit and loss up $50.00');
  });

  it('omits the percentage parenthetical when pnlPercent is undefined', () => {
    expect(buildPnlAriaLabel(50, undefined)).toBe('Profit and loss up $50.00');
  });

  it('omits the percentage parenthetical when pnlPercent is NaN', () => {
    expect(buildPnlAriaLabel(50, Number.NaN)).toBe('Profit and loss up $50.00');
  });

  it('omits the percentage parenthetical when pnlPercent is Infinity', () => {
    // Division-by-zero upstream (cost basis = 0) can produce Infinity. The
    // helper should drop the parenthetical instead of announcing "Infinity%".
    expect(buildPnlAriaLabel(50, Number.POSITIVE_INFINITY)).toBe('Profit and loss up $50.00');
    expect(buildPnlAriaLabel(50, Number.NEGATIVE_INFINITY)).toBe('Profit and loss up $50.00');
  });

  it('returns the unavailable variant when pnl is null', () => {
    expect(buildPnlAriaLabel(null, 5)).toBe('Profit and loss unavailable');
  });

  it('returns the unavailable variant when pnl is undefined', () => {
    expect(buildPnlAriaLabel(undefined, 5)).toBe('Profit and loss unavailable');
  });

  it('returns the unavailable variant when pnl is NaN', () => {
    expect(buildPnlAriaLabel(Number.NaN, 5)).toBe('Profit and loss unavailable');
  });

  it('returns the unavailable variant when pnl is Infinity', () => {
    expect(buildPnlAriaLabel(Number.POSITIVE_INFINITY, 5)).toBe('Profit and loss unavailable');
    expect(buildPnlAriaLabel(Number.NEGATIVE_INFINITY, 5)).toBe('Profit and loss unavailable');
  });
});
