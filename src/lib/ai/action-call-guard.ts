/**
 * AI Action Call Guard.
 *
 * Validates every AI-generated action call against the strict allowlist.
 * The AI Agent is permitted to explain, audit, and compare — never to
 * execute trades or propose executable trading actions.
 *
 * Any action call that fails validation is rejected before it can reach
 * downstream consumers.
 */

import type { AiAgentActionCall } from '@/types/ai';

const ALLOWED_ACTIONS = new Set([
  'EXPLAIN_SIGNAL',
  'AUDIT_SIGNAL',
  'CHECK_RISK',
  'COMPARE_LONG_SHORT',
  'SUGGEST_WAIT_CONDITIONS',
  'REQUEST_FRESH_DATA',
] as const);

/**
 * Explicitly blocked action concepts. If the AI hallucinates any of these,
 * the guard rejects immediately with a clear reason.
 */
const BLOCKED_ACTIONS = new Set([
  'PLACE_ORDER',
  'SET_LEVERAGE',
  'OPEN_POSITION',
  'CLOSE_POSITION',
  'CANCEL_ORDER',
]);

export interface ActionCallValidationResult {
  ok: boolean;
  reason: string | null;
}

/**
 * Validates an AI action call against the strict allowlist.
 *
 * Returns `{ ok: true }` only when:
 *   1. The action is in the allowed set.
 *   2. `allowedToTrade` is explicitly `false`.
 *   3. Required context fields (symbol, timeframe) are present.
 *
 * All other cases return `{ ok: false, reason }`.
 */
export function validateAiActionCall(call: AiAgentActionCall): ActionCallValidationResult {
  // Block explicitly dangerous actions first.
  if (BLOCKED_ACTIONS.has(call.action as string)) {
    return {
      ok: false,
      reason: `Action "${call.action}" is explicitly blocked. AI Agent cannot execute trades.`,
    };
  }

  if (!ALLOWED_ACTIONS.has(call.action)) {
    return {
      ok: false,
      reason: `Action "${call.action}" is not allowed. Permitted: ${[...ALLOWED_ACTIONS].join(', ')}.`,
    };
  }

  if (call.allowedToTrade !== false) {
    return {
      ok: false,
      reason: 'AI Agent is not allowed to trade or execute orders. allowedToTrade must be false.',
    };
  }

  if (!call.symbol || typeof call.symbol !== 'string' || call.symbol.trim().length === 0) {
    return { ok: false, reason: 'Action call requires a valid symbol.' };
  }

  if (!call.timeframe || typeof call.timeframe !== 'string' || call.timeframe.trim().length === 0) {
    return { ok: false, reason: 'Action call requires a valid timeframe.' };
  }

  return { ok: true, reason: null };
}
