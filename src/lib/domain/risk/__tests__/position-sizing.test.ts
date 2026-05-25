import { describe, expect, it } from 'vitest';
import {
  computePositionSize,
  describePositionSizingError,
  type PositionSizingInputs,
} from '../position-sizing';

/**
 * Position-sizing utility tests.
 *
 * Locks down the contract for the calculator: deterministic outputs,
 * conservative leverage cap behaviour, and explicit error reporting.
 */

function baseInputs(overrides: Partial<PositionSizingInputs> = {}): PositionSizingInputs {
  return {
    side: 'LONG',
    entry: 100,
    stopLoss: 95,
    accountSize: 1000,
    riskPerTrade: 0.01, // 1%
    maxLeverage: 5,
    ...overrides,
  };
}

describe('computePositionSize', () => {
  it('produces a deterministic LONG plan with no leverage cap breach', () => {
    const result = computePositionSize(baseInputs());
    if (!result.ok) throw new Error(`expected ok, got ${result.error}`);
    const { plan } = result;

    // Risk = 1000 * 0.01 = $10
    expect(plan.riskAmount).toBe(10);
    // r-distance = 5
    expect(plan.rDistance).toBe(5);
    // qty = 10 / 5 = 2 units
    expect(plan.qty).toBe(2);
    // notional = 2 * 100 = $200
    expect(plan.notional).toBe(200);
    // required lev = 200 / 1000 = 0.2x — well under cap.
    expect(plan.requiredLeverage).toBe(0.2);
    expect(plan.leverageExceedsCap).toBe(false);
    // capped notional equals notional when cap not breached.
    expect(plan.cappedNotional).toBe(200);
    expect(plan.cappedRiskAmount).toBe(10);
    // margin at cap = notional / cap.
    expect(plan.marginAtCappedLeverage).toBeCloseTo(40, 6);
  });

  it('produces a deterministic SHORT plan with the symmetric stop math', () => {
    const result = computePositionSize(
      baseInputs({ side: 'SHORT', entry: 100, stopLoss: 105 })
    );
    if (!result.ok) throw new Error(`expected ok, got ${result.error}`);
    expect(result.plan.qty).toBe(2);
    expect(result.plan.rDistance).toBe(5);
    expect(result.plan.notional).toBe(200);
  });

  it('caps the position when required leverage exceeds the profile cap', () => {
    // Tight stop → big position. 0.5% stop, 2% risk on $1000 → $20 risk,
    // qty = 20 / 0.5 = 40, notional = 40 * 100 = $4000, required lev = 4x.
    // Cap to 3x → cappedNotional = 3000, cappedRisk = 15.
    const result = computePositionSize(
      baseInputs({
        entry: 100,
        stopLoss: 99.5,
        riskPerTrade: 0.02,
        maxLeverage: 3,
      })
    );
    if (!result.ok) throw new Error(`expected ok, got ${result.error}`);
    const { plan } = result;

    expect(plan.requiredLeverage).toBe(4);
    expect(plan.leverageExceedsCap).toBe(true);
    expect(plan.cappedLeverage).toBe(3);
    expect(plan.cappedNotional).toBe(3000);
    // cappedQty = 3000 / 100 = 30
    expect(plan.cappedQty).toBe(30);
    // cappedRisk = 30 * 0.5 = 15 (down from 20)
    expect(plan.cappedRiskAmount).toBe(15);
    expect(plan.marginAtCappedLeverage).toBe(1000);
  });

  it('uses the stricter of profile cap and engine suggested max', () => {
    const result = computePositionSize(
      baseInputs({
        entry: 100,
        stopLoss: 99.5,
        riskPerTrade: 0.02,
        maxLeverage: 8,
        suggestedLeverage: { min: 1, max: 2 },
      })
    );
    if (!result.ok) throw new Error(`expected ok, got ${result.error}`);
    expect(result.plan.cappedLeverage).toBe(2);
    expect(result.plan.cappedNotional).toBe(2000);
  });

  it('rejects a LONG with stop above entry', () => {
    const result = computePositionSize(baseInputs({ stopLoss: 105 }));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe('stop_on_wrong_side');
  });

  it('rejects a SHORT with stop below entry', () => {
    const result = computePositionSize(
      baseInputs({ side: 'SHORT', entry: 100, stopLoss: 95 })
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe('stop_on_wrong_side');
  });

  it('rejects sub-cent stop distance to avoid absurd sizing', () => {
    const result = computePositionSize(
      baseInputs({ entry: 100, stopLoss: 99.999 })
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe('risk_distance_too_small');
  });

  it('rejects zero or negative account size', () => {
    const r1 = computePositionSize(baseInputs({ accountSize: 0 }));
    expect(r1.ok).toBe(false);
    if (!r1.ok) expect(r1.error).toBe('invalid_account_size');

    const r2 = computePositionSize(baseInputs({ accountSize: -100 }));
    expect(r2.ok).toBe(false);
    if (!r2.ok) expect(r2.error).toBe('invalid_account_size');
  });

  it('rejects risk per trade outside (0, 1]', () => {
    const r1 = computePositionSize(baseInputs({ riskPerTrade: 0 }));
    expect(r1.ok).toBe(false);
    if (!r1.ok) expect(r1.error).toBe('invalid_risk_per_trade');

    const r2 = computePositionSize(baseInputs({ riskPerTrade: 1.5 }));
    expect(r2.ok).toBe(false);
    if (!r2.ok) expect(r2.error).toBe('invalid_risk_per_trade');
  });

  it('rejects non-finite or zero entry/stop', () => {
    const r1 = computePositionSize(baseInputs({ entry: NaN }));
    expect(r1.ok).toBe(false);
    if (!r1.ok) expect(r1.error).toBe('invalid_entry');

    const r2 = computePositionSize(baseInputs({ stopLoss: 0 }));
    expect(r2.ok).toBe(false);
    if (!r2.ok) expect(r2.error).toBe('invalid_stop_loss');
  });

  it('rejects invalid side', () => {
    const result = computePositionSize(
      baseInputs({ side: 'WAIT' as unknown as 'LONG' })
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('invalid_side');
  });

  it('describes every error variant with non-empty user copy', () => {
    const errors = [
      'invalid_side',
      'invalid_entry',
      'invalid_stop_loss',
      'invalid_account_size',
      'invalid_risk_per_trade',
      'invalid_max_leverage',
      'stop_on_wrong_side',
      'risk_distance_too_small',
    ] as const;
    for (const e of errors) {
      const description = describePositionSizingError(e);
      expect(description.length).toBeGreaterThan(0);
    }
  });

  it('handles fractional crypto sizes without precision blow-up', () => {
    const result = computePositionSize(
      baseInputs({ entry: 67_321.45, stopLoss: 66_000, accountSize: 5000, riskPerTrade: 0.005 })
    );
    if (!result.ok) throw new Error(`expected ok, got ${result.error}`);
    const { plan } = result;
    // risk = 25, rDistance = 1321.45, qty ≈ 0.01892 BTC
    expect(plan.riskAmount).toBe(25);
    expect(plan.qty).toBeGreaterThan(0);
    expect(plan.qty).toBeLessThan(1);
    expect(plan.notional).toBeGreaterThan(plan.riskAmount);
  });
});
