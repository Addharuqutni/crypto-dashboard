/**
 * AI Agent type definitions.
 * Supports any OpenAI-compatible API provider.
 */

export interface AiConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
}

export type AiMessageRole = 'system' | 'user' | 'assistant';

export interface AiMessage {
  id: string;
  role: AiMessageRole;
  content: string;
  timestamp: number;
}

export interface AiStreamChunk {
  id: string;
  choices: {
    delta: {
      content?: string;
      role?: AiMessageRole;
    };
    finish_reason: string | null;
    index: number;
  }[];
}

export interface AiChatCompletionRequest {
  model: string;
  messages: { role: AiMessageRole; content: string }[];
  stream?: boolean;
  temperature?: number;
  max_tokens?: number;
}

export interface AiChatCompletionResponse {
  id: string;
  choices: {
    message: { role: AiMessageRole; content: string };
    finish_reason: string;
    index: number;
  }[];
}

/** Technical context data passed to AI as system prompt context */
export interface TechnicalContext {
  symbol: string;
  timeframe: string;
  price?: number;
  rsi?: { value: number; status: string };
  macd?: { macd: number; signal: number; histogram: number };
  trend?: { value: string; reasons: string[] };
  supportResistance?: { support: number | null; resistance: number | null; confidence: string };
  fibonacci?: { direction: string; levels: { label: string; price: number }[] };
  orderBlocks?: { type: string; high: number; low: number; strength: string }[];
}

/**
 * Strict allowlist of AI Agent actions.
 *
 * The agent may explain, audit, compare, suggest wait conditions, or request
 * fresh data. It can NEVER place orders, set leverage, open/close positions,
 * or cancel orders.
 */
export type AiAgentAction =
  | 'EXPLAIN_SIGNAL'
  | 'AUDIT_SIGNAL'
  | 'CHECK_RISK'
  | 'COMPARE_LONG_SHORT'
  | 'SUGGEST_WAIT_CONDITIONS'
  | 'REQUEST_FRESH_DATA';

/**
 * Structured action call returned by the AI Agent.
 *
 * `allowedToTrade` is intentionally pinned to `false` at the type level so any
 * attempt to surface trade-execution intent is rejected by both TypeScript
 * and the runtime guard in `src/lib/ai/action-call-guard.ts`.
 */
export interface AiAgentActionCall {
  action: AiAgentAction;
  symbol: string;
  timeframe: string;
  reason: string;
  requiresFreshData: boolean;
  allowedToTrade: false;
}
