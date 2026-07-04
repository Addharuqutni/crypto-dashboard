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
