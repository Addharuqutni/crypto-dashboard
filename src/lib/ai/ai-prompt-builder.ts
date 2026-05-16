/**
 * AI Prompt Builder — constructs system prompts with technical analysis context.
 * Formats indicator data into structured context that helps the AI provide
 * accurate, data-driven technical analysis advice.
 */

import type { TechnicalContext } from '@/types/ai';

/**
 * Builds the system prompt that defines the AI agent's persona and behavior.
 * Includes current technical analysis data as structured context.
 */
export function buildSystemPrompt(context: TechnicalContext): string {
  const sections: string[] = [
    PERSONA_PROMPT,
    buildMarketContext(context),
    RULES_PROMPT,
  ];

  return sections.filter(Boolean).join('\n\n');
}

/**
 * Formats a user question with optional additional context.
 */
export function buildUserMessage(question: string): string {
  return question.trim();
}

// --- Prompt Sections ---

const PERSONA_PROMPT = `You are an expert cryptocurrency technical analyst AI assistant. Your role is to provide detailed, professional-grade technical analysis based on the market data provided.

Your expertise includes:
- Candlestick pattern recognition and interpretation
- RSI (Relative Strength Index) analysis and divergence detection
- MACD (Moving Average Convergence Divergence) signal interpretation
- Support and Resistance level identification
- Fibonacci Retracement level analysis
- Order Block (Smart Money Concept) identification
- Trend analysis using moving averages
- Volume analysis and confirmation
- Risk management and position sizing guidance
- Multi-timeframe analysis correlation

Communication style:
- Be concise but thorough
- Use professional trading terminology
- Provide actionable insights with clear reasoning
- Always mention key levels (entry, stop-loss, take-profit when relevant)
- Rate confidence level of your analysis (High/Medium/Low)
- Use bullet points for clarity
- Include risk warnings when appropriate`;

const RULES_PROMPT = `Important rules:
- You are an EXPLAINER of the existing signal engine output, not a decision maker.
- ALWAYS base your analysis on the provided technical data.
- NEVER invent price levels, indicators, or values that are not present in the context.
- NEVER override the risk engine. If action is WAIT, explain why WAIT is the correct decision.
- ALWAYS include risk and invalidation in your reasoning.
- If data is insufficient, say so clearly.
- Provide both bullish and bearish scenarios when applicable.
- Mention invalidation levels for your analysis.
- Consider multiple timeframes when possible.
- Be honest about uncertainty — markets are probabilistic.
- Use setup, bias, invalidation, confirmation, and risk language.
- NEVER say "guaranteed", "sure win", "risk-free", or "must enter".
- NEVER guarantee profits or specific price predictions.
- Refuse to give explicit financial advice. Frame guidance as setup discipline.

DISCLAIMER: Your analysis is for educational and informational purposes only. It is NOT financial advice. Users should always do their own research and consider their risk tolerance before making trading decisions.`;

/**
 * Builds the market context section from technical indicator data.
 */
function buildMarketContext(context: TechnicalContext): string {
  const lines: string[] = [
    `--- CURRENT MARKET DATA ---`,
    `Symbol: ${context.symbol}`,
    `Timeframe: ${context.timeframe}`,
  ];

  if (context.price != null) {
    lines.push(`Current Price: $${context.price.toLocaleString()}`);
  }

  // Trend
  if (context.trend) {
    lines.push(`\n[TREND ANALYSIS]`);
    lines.push(`Direction: ${context.trend.value.toUpperCase()}`);
    if (context.trend.reasons.length > 0) {
      lines.push(`Reasons: ${context.trend.reasons.join(', ')}`);
    }
  }

  // RSI
  if (context.rsi) {
    lines.push(`\n[RSI (14)]`);
    lines.push(`Value: ${context.rsi.value.toFixed(1)}`);
    lines.push(`Status: ${context.rsi.status}`);
  }

  // MACD
  if (context.macd) {
    lines.push(`\n[MACD (12, 26, 9)]`);
    lines.push(`MACD Line: ${context.macd.macd.toFixed(4)}`);
    lines.push(`Signal Line: ${context.macd.signal.toFixed(4)}`);
    lines.push(`Histogram: ${context.macd.histogram.toFixed(4)}`);
    lines.push(`Signal: ${context.macd.histogram > 0 ? 'Bullish (above signal)' : 'Bearish (below signal)'}`);
  }

  // Support / Resistance
  if (context.supportResistance) {
    lines.push(`\n[SUPPORT / RESISTANCE]`);
    if (context.supportResistance.support != null) {
      lines.push(`Support: $${context.supportResistance.support.toLocaleString()}`);
    }
    if (context.supportResistance.resistance != null) {
      lines.push(`Resistance: $${context.supportResistance.resistance.toLocaleString()}`);
    }
    lines.push(`Confidence: ${context.supportResistance.confidence}`);
  }

  // Fibonacci
  if (context.fibonacci) {
    lines.push(`\n[FIBONACCI RETRACEMENT]`);
    lines.push(`Direction: ${context.fibonacci.direction}`);
    for (const level of context.fibonacci.levels) {
      lines.push(`  ${level.label}: $${level.price.toLocaleString()}`);
    }
  }

  // Order Blocks
  if (context.orderBlocks && context.orderBlocks.length > 0) {
    lines.push(`\n[ORDER BLOCKS (Smart Money)]`);
    for (const ob of context.orderBlocks) {
      lines.push(`  ${ob.type.toUpperCase()} OB: $${ob.low.toLocaleString()} — $${ob.high.toLocaleString()} (${ob.strength})`);
    }
  }

  lines.push(`\n--- END MARKET DATA ---`);

  return lines.join('\n');
}

/**
 * Creates a summary string of the current technical context for display in UI badges.
 */
export function buildContextSummary(context: TechnicalContext): string {
  const parts: string[] = [];

  if (context.trend) {
    parts.push(`Trend: ${context.trend.value}`);
  }
  if (context.rsi) {
    parts.push(`RSI: ${context.rsi.value.toFixed(0)}`);
  }
  if (context.macd) {
    parts.push(`MACD: ${context.macd.histogram > 0 ? '↑' : '↓'}`);
  }
  if (context.supportResistance?.support) {
    parts.push(`S: $${context.supportResistance.support.toLocaleString()}`);
  }
  if (context.supportResistance?.resistance) {
    parts.push(`R: $${context.supportResistance.resistance.toLocaleString()}`);
  }

  return parts.join(' · ') || 'No data';
}
