import { describe, expect, it } from 'vitest';
import { evaluateLateEntryGuard } from '../late-entry-guard';

/**
 * Tests for the late-entry guard.
 *
 * Contract:
 *   - SHORT + bearish trend + RSI oversold near support \u2192 blocked.
 *   - LONG + bullish trend + RSI overbought near resistance \u2192 blocked.
 *   - Stretched from EMA20 + weak volume \u2192 blocked.
 *   - Normal non-stretched setup \u2192 not blocked.
 */

describe('evaluateLateEntryGuard', () => {
  it('blocks SHORT when 4H is bearish, RSI is oversold, and price is near support', () => {
    const result = evaluateLateEntryGuard({
      side: 'SHORT',
      macroRegime: 'bearish_trend',
      setupRsi: 25,
      triggerRsi: 28,
      distanceFromEma20Pct: 0.5,
      nearSupport: true,
      nearResistance: false,
      volumeIsWeak: false,
    });

    expect(result.blocked).toBe(true);
    expect(result.severity).toBe('block');
    expect(result.reason).toMatch(/oversold/i);
  });

  it('blocks SHORT when only triggerRsi is below 30 with bearish trend near support', () => {
    const result = evaluateLateEntryGuard({
      side: 'SHORT',
      macroRegime: 'bearish_trend',
      setupRsi: 40,
      triggerRsi: 29,
      distanceFromEma20Pct: 0.5,
      nearSupport: true,
      nearResistance: false,
      volumeIsWeak: false,
    });

    expect(result.blocked).toBe(true);
  });

  it('blocks LONG when 4H is bullish, RSI is overbought, and price is near resistance', () => {
    const result = evaluateLateEntryGuard({
      side: 'LONG',
      macroRegime: 'bullish_trend',
      setupRsi: 78,
      triggerRsi: 75,
      distanceFromEma20Pct: 0.5,
      nearSupport: false,
      nearResistance: true,
      volumeIsWeak: false,
    });

    expect(result.blocked).toBe(true);
    expect(result.severity).toBe('block');
    expect(result.reason).toMatch(/overbought/i);
  });

  it('blocks LONG when only triggerRsi is above 70 with bullish trend near resistance', () => {
    const result = evaluateLateEntryGuard({
      side: 'LONG',
      macroRegime: 'bullish_trend',
      setupRsi: 60,
      triggerRsi: 71,
      distanceFromEma20Pct: 0.5,
      nearSupport: false,
      nearResistance: true,
      volumeIsWeak: false,
    });

    expect(result.blocked).toBe(true);
  });

  it('blocks any side when stretched from EMA20 with weak volume', () => {
    const result = evaluateLateEntryGuard({
      side: 'LONG',
      macroRegime: 'range',
      setupRsi: 55,
      triggerRsi: 50,
      distanceFromEma20Pct: 2.5,
      nearSupport: false,
      nearResistance: false,
      volumeIsWeak: true,
    });

    expect(result.blocked).toBe(true);
    expect(result.reason).toMatch(/stretched/i);
  });

  it('does NOT block when stretched but volume is healthy', () => {
    const result = evaluateLateEntryGuard({
      side: 'LONG',
      macroRegime: 'bullish_trend',
      setupRsi: 55,
      triggerRsi: 50,
      distanceFromEma20Pct: 2.5,
      nearSupport: false,
      nearResistance: false,
      volumeIsWeak: false,
    });

    expect(result.blocked).toBe(false);
  });

  it('does NOT block a normal LONG setup with neutral RSI not near resistance', () => {
    const result = evaluateLateEntryGuard({
      side: 'LONG',
      macroRegime: 'bullish_trend',
      setupRsi: 55,
      triggerRsi: 58,
      distanceFromEma20Pct: 0.3,
      nearSupport: false,
      nearResistance: false,
      volumeIsWeak: false,
    });

    expect(result.blocked).toBe(false);
    expect(result.severity).toBe('info');
    expect(result.reason).toBeNull();
  });

  it('does NOT block a SHORT in bearish trend if RSI is not oversold', () => {
    const result = evaluateLateEntryGuard({
      side: 'SHORT',
      macroRegime: 'bearish_trend',
      setupRsi: 45,
      triggerRsi: 50,
      distanceFromEma20Pct: 0.4,
      nearSupport: true,
      nearResistance: false,
      volumeIsWeak: false,
    });

    expect(result.blocked).toBe(false);
  });

  it('does NOT block a LONG in bullish trend overbought but not near resistance', () => {
    const result = evaluateLateEntryGuard({
      side: 'LONG',
      macroRegime: 'bullish_trend',
      setupRsi: 76,
      triggerRsi: 73,
      distanceFromEma20Pct: 0.3,
      nearSupport: false,
      nearResistance: false,
      volumeIsWeak: false,
    });

    expect(result.blocked).toBe(false);
  });

  it('handles null RSI values gracefully', () => {
    const result = evaluateLateEntryGuard({
      side: 'LONG',
      macroRegime: 'range',
      setupRsi: null,
      triggerRsi: null,
      distanceFromEma20Pct: 0.5,
      nearSupport: false,
      nearResistance: false,
      volumeIsWeak: false,
    });

    expect(result.blocked).toBe(false);
  });
});
