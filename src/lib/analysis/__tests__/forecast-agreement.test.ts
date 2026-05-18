import { describe, expect, it } from 'vitest';
import { evaluateForecastAgreement } from '../forecast-agreement';
import type { ForecastSummary } from '@/types/forecast';

/**
 * Tests for the forecast-agreement layer.
 *
 * Contract:
 *   - WAIT + any direction \u2192 neutral, no trade upgrade.
 *   - Aligned forecast \u2192 small positive boost (3 or 7 depending on grade).
 *   - Conflicting forecast \u2192 -15 confidence penalty.
 *   - Invalid/unavailable forecast \u2192 0 adjustment, ignored.
 */

function makeForecast(overrides: Partial<ForecastSummary> = {}): ForecastSummary {
  return {
    provider: 'kronos',
    symbol: 'BTCUSDT',
    timeframe: '30m',
    valid: true,
    direction: 'up',
    expectedReturnPct: 0.5,
    forecastVolatilityPct: 1.2,
    confidenceProxy: 0.7,
    warnings: [],
    ...overrides,
  };
}

describe('evaluateForecastAgreement', () => {
  it('LONG + forecast down \u2192 conflicting with negative confidence', () => {
    const result = evaluateForecastAgreement({
      action: 'LONG',
      grade: 'A',
      forecast: makeForecast({ direction: 'down' }),
    });

    expect(result.alignment).toBe('conflicting');
    expect(result.confidenceAdjustment).toBeLessThan(0);
    expect(result.usedInDecision).toBe(true);
    expect(result.warning).not.toBeNull();
  });

  it('SHORT + forecast down \u2192 aligned with positive confidence', () => {
    const result = evaluateForecastAgreement({
      action: 'SHORT',
      grade: 'A',
      forecast: makeForecast({ direction: 'down' }),
    });

    expect(result.alignment).toBe('aligned');
    expect(result.confidenceAdjustment).toBeGreaterThan(0);
    expect(result.usedInDecision).toBe(true);
    expect(result.warning).toBeNull();
  });

  it('LONG + forecast up + strong grade \u2192 boost of 7', () => {
    const result = evaluateForecastAgreement({
      action: 'LONG',
      grade: 'B',
      forecast: makeForecast({ direction: 'up' }),
    });

    expect(result.alignment).toBe('aligned');
    expect(result.confidenceAdjustment).toBe(7);
  });

  it('LONG + forecast up + weak grade \u2192 boost of 3', () => {
    const result = evaluateForecastAgreement({
      action: 'LONG',
      grade: 'C',
      forecast: makeForecast({ direction: 'up' }),
    });

    expect(result.alignment).toBe('aligned');
    expect(result.confidenceAdjustment).toBe(3);
  });

  it('WAIT + forecast up \u2192 neutral, never upgraded to a trade', () => {
    const result = evaluateForecastAgreement({
      action: 'WAIT',
      grade: 'A',
      forecast: makeForecast({ direction: 'up' }),
    });

    expect(result.alignment).toBe('neutral');
    expect(result.confidenceAdjustment).toBe(0);
    expect(result.usedInDecision).toBe(false);
  });

  it('WAIT + forecast down \u2192 neutral, never upgraded to a trade', () => {
    const result = evaluateForecastAgreement({
      action: 'WAIT',
      grade: 'A',
      forecast: makeForecast({ direction: 'down' }),
    });

    expect(result.alignment).toBe('neutral');
    expect(result.confidenceAdjustment).toBe(0);
    expect(result.usedInDecision).toBe(false);
  });

  it('invalid forecast \u2192 alignment invalid, ignored, with warning', () => {
    const result = evaluateForecastAgreement({
      action: 'LONG',
      grade: 'A',
      forecast: makeForecast({ valid: false }),
    });

    expect(result.alignment).toBe('invalid');
    expect(result.confidenceAdjustment).toBe(0);
    expect(result.usedInDecision).toBe(false);
    expect(result.warning).toMatch(/invalid/i);
  });

  it('missing forecast \u2192 unavailable, no adjustment', () => {
    const result = evaluateForecastAgreement({
      action: 'LONG',
      grade: 'A',
    });

    expect(result.alignment).toBe('unavailable');
    expect(result.confidenceAdjustment).toBe(0);
    expect(result.usedInDecision).toBe(false);
    expect(result.warning).toBeNull();
  });

  it('null forecast \u2192 unavailable, no adjustment', () => {
    const result = evaluateForecastAgreement({
      action: 'SHORT',
      grade: 'B',
      forecast: null,
    });

    expect(result.alignment).toBe('unavailable');
    expect(result.confidenceAdjustment).toBe(0);
  });

  it('flat forecast direction \u2192 neutral, no boost', () => {
    const result = evaluateForecastAgreement({
      action: 'LONG',
      grade: 'A',
      forecast: makeForecast({ direction: 'flat' }),
    });

    expect(result.alignment).toBe('neutral');
    expect(result.confidenceAdjustment).toBe(0);
    expect(result.usedInDecision).toBe(false);
  });

  it('uncertain forecast direction \u2192 neutral, no boost', () => {
    const result = evaluateForecastAgreement({
      action: 'SHORT',
      grade: 'B',
      forecast: makeForecast({ direction: 'uncertain' }),
    });

    expect(result.alignment).toBe('neutral');
    expect(result.confidenceAdjustment).toBe(0);
  });
});
