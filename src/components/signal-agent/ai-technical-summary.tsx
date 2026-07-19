'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useAiStore } from '@/stores/use-ai-store';
import { sendServerChatCompletion } from '@/lib/adapters/ai/ai-client';
import { buildSystemPrompt } from '@/lib/adapters/ai/ai-prompt-builder';
import { cn } from '@/lib/shared/utils';
import type { TechnicalContext } from '@/types/ai';
import { Bot, RefreshCw, Sparkles, AlertTriangle, Copy, Check } from 'lucide-react';

interface AiTechnicalSummaryProps {
  context: TechnicalContext | null;
}

function getContextSignature(ctx: TechnicalContext | null): string {
  if (!ctx) return 'null';
  const rsi = ctx.rsi?.value != null ? ctx.rsi.value.toFixed(0) : '-';
  const trend = ctx.trend?.value ?? '-';
  const macd = ctx.macd?.histogram != null ? ctx.macd.histogram.toFixed(2) : '-';
  return `${ctx.symbol}|${ctx.timeframe}|${rsi}|${trend}|${macd}`;
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

/**
 * AI-powered Technical Summary from chart technical context.
 * Action Call decisions come from the Python agent separately.
 */
export function AiTechnicalSummary({ context }: AiTechnicalSummaryProps) {
  const config = useAiStore((s) => s.config);
  const isConfigured = useAiStore((s) => s.isConfigured);
  const serverManaged = useAiStore((s) => s.serverManaged);

  const [summary, setSummary] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);

  const lastSignature = useRef<string>('');
  const abortRef = useRef<AbortController | null>(null);
  const signature = useMemo(() => getContextSignature(context), [context]);

  const fetchSummary = useCallback(async () => {
    if (!isConfigured || !context) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);

    try {
      const systemPrompt = buildSystemPrompt(context);
      const userPrompt = buildContextOnlyPrompt(context.symbol);

      const response = await sendServerChatCompletion(
        [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        {
          config: serverManaged ? undefined : config,
          temperature: 0.3,
          maxTokens: 320,
          signal: controller.signal,
        }
      );

      if (controller.signal.aborted) return;

      setSummary(response.trim());
      setUpdatedAt(Date.now());
      lastSignature.current = signature;
    } catch (err) {
      if (controller.signal.aborted) return;
      setError(err instanceof Error ? err.message : 'Failed to generate summary');
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, [isConfigured, context, config, serverManaged, signature]);

  useEffect(() => {
    if (!isConfigured || !context) return;
    if (signature === lastSignature.current) return;
    void fetchSummary();
  }, [signature, isConfigured, context, fetchSummary]);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  const handleCopy = useCallback(async () => {
    if (!summary) return;
    try {
      await navigator.clipboard.writeText(summary);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard may be unavailable in insecure contexts.
    }
  }, [summary]);

  if (!isConfigured) {
    return (
      <section className="card relative overflow-hidden p-5" aria-labelledby="ai-summary-heading">
        <header className="flex items-center gap-2">
          <Sparkles className="h-3.5 w-3.5 text-accent-secondary/50" aria-hidden />
          <h3
            id="ai-summary-heading"
            className="text-xs font-semibold uppercase tracking-wider text-text-muted"
          >
            AI Summary
          </h3>
        </header>
        <p className="mt-2 text-xs italic leading-relaxed text-text-muted">
          Configure the AI Agent to receive an intelligent technical analysis powered by your LLM.
        </p>
      </section>
    );
  }

  if (!context) return null;

  return (
    <section
      className="card relative overflow-hidden px-4 py-4"
      aria-labelledby="ai-summary-heading"
    >
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-accent-secondary/40 to-transparent"
      />

      <header className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Bot className="h-3.5 w-3.5 text-accent-secondary" aria-hidden />
          <h3
            id="ai-summary-heading"
            className="text-xs font-semibold uppercase tracking-wider text-text-secondary"
          >
            AI Summary
          </h3>
        </div>
        <div className="flex items-center gap-1.5">
          {updatedAt != null && !loading && (
            <span className="text-[10px] text-text-muted">{formatTime(updatedAt)}</span>
          )}
          {summary && !loading && (
            <button
              type="button"
              onClick={handleCopy}
              className="rounded p-1 text-text-muted transition-colors hover:bg-bg-surface-soft hover:text-text-secondary"
              aria-label="Copy summary"
            >
              {copied ? <Check className="h-3 w-3 text-market-up" /> : <Copy className="h-3 w-3" />}
            </button>
          )}
          <button
            type="button"
            onClick={() => void fetchSummary()}
            disabled={loading}
            className="rounded p-1 text-text-muted transition-colors hover:bg-bg-surface-soft hover:text-text-secondary disabled:opacity-50"
            aria-label="Refresh summary"
          >
            <RefreshCw className={cn('h-3 w-3', loading && 'animate-spin')} />
          </button>
        </div>
      </header>

      <div className="mt-3">
        {loading && !summary && (
          <p className="text-xs italic text-text-muted">Generating analysis…</p>
        )}
        {error && (
          <div className="flex items-start gap-2 rounded-md border border-market-down/30 bg-market-down/5 px-3 py-2">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-market-down" />
            <p className="text-xs text-market-down">{error}</p>
          </div>
        )}
        {summary && (
          <p className="text-sm leading-relaxed text-text-secondary">
            {renderMarkdownLite(summary)}
          </p>
        )}
      </div>
    </section>
  );
}

function renderMarkdownLite(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return (
        <strong key={i} className="font-semibold text-text-primary">
          {part.slice(2, -2)}
        </strong>
      );
    }
    return <span key={i}>{part}</span>;
  });
}

function buildContextOnlyPrompt(symbol: string): string {
  return [
    `Provide a brief technical summary (3–4 sentences) for ${symbol} based on the attached data.`,
    '',
    'Focus on:',
    '1. Current directional bias (bullish / bearish / sideways).',
    '2. Key levels (support, resistance, Fibonacci levels) to watch.',
    '3. Confirmation or divergence from indicators (RSI, MACD).',
    '4. What would invalidate the current bias.',
    '',
    'DO NOT recommend specific entry / exit / leverage. Action Call is owned by the Python agent. Stay descriptive. Answer in English, professional, and concise.',
  ].join('\n');
}
