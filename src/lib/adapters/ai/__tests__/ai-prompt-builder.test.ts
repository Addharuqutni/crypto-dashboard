import { describe, expect, it } from 'vitest';
import { buildContextSummary, buildSystemPrompt, buildUserMessage } from '../ai-prompt-builder';
import type { TechnicalContext } from '@/types/ai';

const context: TechnicalContext = {
  symbol: 'BTC',
  timeframe: '1H',
  price: 65000,
  rsi: { value: 61.2, status: 'bullish' },
  macd: { macd: 10.12345, signal: 8.12345, histogram: 2 },
  trend: { value: 'uptrend', reasons: ['price above EMA'] },
  supportResistance: { support: 64000, resistance: 67000, confidence: 'high' },
};

describe('ai-prompt-builder', () => {
  it('includes deterministic market context and safety boundaries', () => {
    const prompt = buildSystemPrompt(context);

    expect(prompt).toContain('Symbol: BTC');
    expect(prompt).toContain('Timeframe: 1H');
    expect(prompt).toMatch(/Current Price: \$65[,.]000/);
    expect(prompt).toContain('RSI (14)');
    expect(prompt).toMatch(/Support: \$64[,.]000/);
    expect(prompt).toContain('NEVER override the risk engine');
    expect(prompt).toContain('NOT financial advice');
  });

  it('does not add provider secrets because config/env are not prompt inputs', () => {
    const prompt = buildSystemPrompt(context);

    expect(prompt).not.toContain('sk-test-secret');
    expect(prompt).not.toContain('SUPABASE_SERVICE_ROLE_KEY');
    expect(prompt).not.toContain('API_KEY');
  });

  it('summarizes compact context badges', () => {
    expect(buildContextSummary(context)).toMatch(
      /Trend: uptrend · RSI: 61 · MACD: ↑ · S: \$64[,.]000 · R: \$67[,.]000/
    );
    expect(buildContextSummary({ symbol: 'BTC', timeframe: '1H' })).toBe('No data');
  });

  it('trims user questions without rewriting them', () => {
    expect(buildUserMessage('  explain this setup  ')).toBe('explain this setup');
  });
});
