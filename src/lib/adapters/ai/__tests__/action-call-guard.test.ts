import { describe, expect, it } from 'vitest';
import { validateAiActionCall } from '../action-call-guard';
import type { AiAgentActionCall } from '@/types/ai';

/**
 * Tests for the AI action-call guard.
 *
 * Contract:
 *   - Valid audit/explain actions \u2192 accepted.
 *   - Trade-execution actions (PLACE_ORDER, etc.) \u2192 rejected.
 *   - allowedToTrade !== false \u2192 rejected.
 *   - Missing symbol or timeframe \u2192 rejected.
 *
 * TypeScript's union types make some invalid cases impossible to express
 * cleanly. We use `as unknown as AiAgentActionCall` to simulate runtime
 * inputs that bypass the type system (the real LLM output).
 */

describe('validateAiActionCall', () => {
  it('accepts a valid AUDIT_SIGNAL action', () => {
    const call: AiAgentActionCall = {
      action: 'AUDIT_SIGNAL',
      symbol: 'BTCUSDT',
      timeframe: '30m',
      reason: 'Audit current setup',
      requiresFreshData: false,
      allowedToTrade: false,
    };

    const result = validateAiActionCall(call);
    expect(result.ok).toBe(true);
    expect(result.reason).toBeNull();
  });

  it('accepts EXPLAIN_SIGNAL with valid context', () => {
    const call: AiAgentActionCall = {
      action: 'EXPLAIN_SIGNAL',
      symbol: 'ETHUSDT',
      timeframe: '4h',
      reason: 'Explain current LONG bias',
      requiresFreshData: false,
      allowedToTrade: false,
    };

    expect(validateAiActionCall(call).ok).toBe(true);
  });

  it('accepts COMPARE_LONG_SHORT', () => {
    const call: AiAgentActionCall = {
      action: 'COMPARE_LONG_SHORT',
      symbol: 'BTCUSDT',
      timeframe: '15m',
      reason: 'Compare directional thesis',
      requiresFreshData: false,
      allowedToTrade: false,
    };

    expect(validateAiActionCall(call).ok).toBe(true);
  });

  it('accepts CHECK_RISK', () => {
    const call: AiAgentActionCall = {
      action: 'CHECK_RISK',
      symbol: 'BTCUSDT',
      timeframe: '30m',
      reason: 'Verify risk level',
      requiresFreshData: false,
      allowedToTrade: false,
    };

    expect(validateAiActionCall(call).ok).toBe(true);
  });

  it('accepts SUGGEST_WAIT_CONDITIONS', () => {
    const call: AiAgentActionCall = {
      action: 'SUGGEST_WAIT_CONDITIONS',
      symbol: 'BTCUSDT',
      timeframe: '15m',
      reason: 'List confirmation conditions',
      requiresFreshData: false,
      allowedToTrade: false,
    };

    expect(validateAiActionCall(call).ok).toBe(true);
  });

  it('accepts REQUEST_FRESH_DATA', () => {
    const call: AiAgentActionCall = {
      action: 'REQUEST_FRESH_DATA',
      symbol: 'BTCUSDT',
      timeframe: '4h',
      reason: 'Stale data detected',
      requiresFreshData: true,
      allowedToTrade: false,
    };

    expect(validateAiActionCall(call).ok).toBe(true);
  });

  it('rejects PLACE_ORDER explicitly', () => {
    const call = {
      action: 'PLACE_ORDER',
      symbol: 'BTCUSDT',
      timeframe: '15m',
      reason: 'Try to place an order',
      requiresFreshData: false,
      allowedToTrade: false,
    } as unknown as AiAgentActionCall;

    const result = validateAiActionCall(call);
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/blocked|cannot execute/i);
  });

  it('rejects SET_LEVERAGE explicitly', () => {
    const call = {
      action: 'SET_LEVERAGE',
      symbol: 'BTCUSDT',
      timeframe: '15m',
      reason: 'Try to set leverage',
      requiresFreshData: false,
      allowedToTrade: false,
    } as unknown as AiAgentActionCall;

    expect(validateAiActionCall(call).ok).toBe(false);
  });

  it('rejects OPEN_POSITION explicitly', () => {
    const call = {
      action: 'OPEN_POSITION',
      symbol: 'BTCUSDT',
      timeframe: '15m',
      reason: 'Try to open a position',
      requiresFreshData: false,
      allowedToTrade: false,
    } as unknown as AiAgentActionCall;

    expect(validateAiActionCall(call).ok).toBe(false);
  });

  it('rejects CLOSE_POSITION explicitly', () => {
    const call = {
      action: 'CLOSE_POSITION',
      symbol: 'BTCUSDT',
      timeframe: '15m',
      reason: 'Try to close',
      requiresFreshData: false,
      allowedToTrade: false,
    } as unknown as AiAgentActionCall;

    expect(validateAiActionCall(call).ok).toBe(false);
  });

  it('rejects CANCEL_ORDER explicitly', () => {
    const call = {
      action: 'CANCEL_ORDER',
      symbol: 'BTCUSDT',
      timeframe: '15m',
      reason: 'Try to cancel',
      requiresFreshData: false,
      allowedToTrade: false,
    } as unknown as AiAgentActionCall;

    expect(validateAiActionCall(call).ok).toBe(false);
  });

  it('rejects when allowedToTrade is true', () => {
    const call = {
      action: 'EXPLAIN_SIGNAL',
      symbol: 'BTCUSDT',
      timeframe: '30m',
      reason: 'Try to trade',
      requiresFreshData: false,
      allowedToTrade: true,
    } as unknown as AiAgentActionCall;

    const result = validateAiActionCall(call);
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/not allowed to trade/i);
  });

  it('rejects when allowedToTrade is missing/truthy', () => {
    const call = {
      action: 'EXPLAIN_SIGNAL',
      symbol: 'BTCUSDT',
      timeframe: '30m',
      reason: 'No allowedToTrade flag',
      requiresFreshData: false,
    } as unknown as AiAgentActionCall;

    expect(validateAiActionCall(call).ok).toBe(false);
  });

  it('rejects when symbol is empty', () => {
    const call = {
      action: 'AUDIT_SIGNAL',
      symbol: '',
      timeframe: '30m',
      reason: 'Empty symbol',
      requiresFreshData: false,
      allowedToTrade: false,
    } as unknown as AiAgentActionCall;

    const result = validateAiActionCall(call);
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/symbol/i);
  });

  it('rejects when timeframe is empty', () => {
    const call = {
      action: 'AUDIT_SIGNAL',
      symbol: 'BTCUSDT',
      timeframe: '',
      reason: 'Empty timeframe',
      requiresFreshData: false,
      allowedToTrade: false,
    } as unknown as AiAgentActionCall;

    const result = validateAiActionCall(call);
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/timeframe/i);
  });

  it('rejects an unknown action string', () => {
    const call = {
      action: 'TOTALLY_MADE_UP',
      symbol: 'BTCUSDT',
      timeframe: '30m',
      reason: 'Unknown action',
      requiresFreshData: false,
      allowedToTrade: false,
    } as unknown as AiAgentActionCall;

    const result = validateAiActionCall(call);
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/not allowed/i);
  });
});
