'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useAiStore } from '@/stores/use-ai-store';
import { sendChatCompletion } from '@/lib/ai/ai-client';
import { buildSystemPrompt } from '@/lib/ai/ai-prompt-builder';
import { cn } from '@/lib/utils';
import type { TechnicalContext } from '@/types/ai';
import { Bot, RefreshCw, Sparkles, AlertTriangle, Copy, Check } from 'lucide-react';

interface AiTechnicalSummaryProps {
  context: TechnicalContext | null;
}

/**
 * Build a stable signature from technical context so we only re-fetch
 * when meaningful values move. Avoids burning credits on minor noise.
 */
function getContextSignature(ctx: TechnicalContext | null): string {
  if (!ctx) return 'null';
  const rsi = ctx.rsi?.value != null ? ctx.rsi.value.toFixed(0) : '-';
  const trend = ctx.trend?.value ?? '-';
  const macd = ctx.macd?.histogram != null ? ctx.macd.histogram.toFixed(2) : '-';
  return `${ctx.symbol}|${ctx.timeframe}|${rsi}|${trend}|${macd}`;
}

/**
 * Format an ISO-ish timestamp into a compact "HH:MM" label.
 */
function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

/**
 * AI-powered Technical Summary — generates a concise analysis from the
 * current technical data using the configured LLM.
 *
 * UX:
 *  - Auto-refreshes only when context signature changes meaningfully.
 *  - Cancels in-flight requests when context changes again, preventing
 *    stale chunks from overwriting the latest result.
 *  - Provides copy-to-clipboard, retry on error, and last-updated meta.
 *  - Falls back to a configuration prompt when the AI client is not set.
 */
export function AiTechnicalSummary({ context }: AiTechnicalSummaryProps) {
  const config = useAiStore((s) => s.config);
  const isConfigured = useAiStore((s) => s.isConfigured);

  const [summary, setSummary] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);

  const lastSignature = useRef<string>('');
  const abortRef = useRef<AbortController | null>(null);

  const signature = useMemo(() => getContextSignature(context), [context]);

  /**
   * Fetches AI summary. Cancels any in-flight request first so the latest
   * context always wins.
   */
  const fetchSummary = useCallback(async () => {
    if (!isConfigured || !context) return;

    // Cancel previous request if still running.
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);

    try {
      const systemPrompt = buildSystemPrompt(context);
      const userPrompt = `Berikan ringkasan teknikal singkat (3-4 kalimat) untuk ${context.symbol} berdasarkan data yang diberikan. Fokus pada:
1. Bias arah (bullish/bearish/sideways)
2. Level kunci yang perlu diperhatikan
3. Sinyal konfirmasi atau divergensi
4. Rekomendasi aksi (wait/entry/exit) dengan confidence level

Jawab dalam format ringkas dan profesional. Gunakan bahasa Indonesia.`;

      const response = await sendChatCompletion(
        config,
        [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        { temperature: 0.5, maxTokens: 300 }
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
  }, [isConfigured, context, config, signature]);

  // Auto-fetch when context signature changes meaningfully.
  useEffect(() => {
    if (!isConfigured || !context) return;
    if (signature === lastSignature.current) return;
    void fetchSummary();
  }, [signature, isConfigured, context, fetchSummary]);

  // Cleanup on unmount — drop any in-flight request.
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
      // Clipboard may be unavailable in insecure contexts — silently ignore.
    }
  }, [summary]);

  // ---- Not configured ---------------------------------------------------

  if (!isConfigured) {
    return (
      <section
        className="card relative overflow-hidden px-4 py-4"
        aria-labelledby="ai-summary-heading"
      >
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

  // ---- No context yet ---------------------------------------------------

  if (!context) return null;

  // ---- Configured + has context ----------------------------------------

  return (
    <section
      className="card relative overflow-hidden px-4 py-4"
      aria-labelledby="ai-summary-heading"
    >
      {/* Subtle accent on the top edge */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-accent-secondary/40 to-transparent"
      />

      {/* Header */}
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-md bg-accent-secondary/10 text-accent-secondary">
            <Bot className="h-3.5 w-3.5" aria-hidden />
          </span>
          <div>
            <h3
              id="ai-summary-heading"
              className="text-xs font-semibold uppercase tracking-wider text-text-muted"
            >
              AI Summary
            </h3>
            <p className="text-[10px] text-text-muted/80">
              {context.symbol} · {context.timeframe}
              {updatedAt && ` · updated ${formatTime(updatedAt)}`}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1">
          {summary && (
            <button
              type="button"
              onClick={handleCopy}
              className="rounded-md p-1.5 text-text-muted transition-colors hover:bg-bg-surface-raised hover:text-text-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
              aria-label={copied ? 'Copied to clipboard' : 'Copy summary'}
              title={copied ? 'Copied!' : 'Copy'}
            >
              {copied ? (
                <Check className="h-3 w-3 text-market-up" aria-hidden />
              ) : (
                <Copy className="h-3 w-3" aria-hidden />
              )}
            </button>
          )}
          <button
            type="button"
            onClick={() => void fetchSummary()}
            disabled={loading}
            className={cn(
              'rounded-md p-1.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring',
              loading
                ? 'cursor-not-allowed text-text-muted/30'
                : 'text-text-muted hover:bg-bg-surface-raised hover:text-text-secondary'
            )}
            aria-label="Refresh AI summary"
            title="Refresh"
          >
            <RefreshCw className={cn('h-3 w-3', loading && 'animate-spin')} aria-hidden />
          </button>
        </div>
      </header>

      {/* Content */}
      <output
        className="mt-3 block min-h-[2.5rem]"
        aria-live="polite"
        aria-busy={loading}
      >
        {loading && !summary && <SummarySkeleton />}

        {summary && (
          <SummaryBody
            text={summary}
            className={cn(loading && 'opacity-60 transition-opacity')}
          />
        )}

        {error && !loading && (
          <div
            className="mt-1 flex items-start gap-2 rounded-md border border-warning/30 bg-warning/5 px-3 py-2"
            role="alert"
          >
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" aria-hidden />
            <div className="flex-1">
              <p className="text-xs font-medium text-warning">Failed to generate summary</p>
              <p className="mt-0.5 text-[11px] leading-relaxed text-text-muted">{error}</p>
              <button
                type="button"
                onClick={() => void fetchSummary()}
                className="mt-1.5 text-[11px] font-medium text-accent-secondary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
              >
                Try again
              </button>
            </div>
          </div>
        )}
      </output>
    </section>
  );
}

// ---- Sub-components ----------------------------------------------------

/**
 * Lightweight markdown-ish renderer for AI output.
 * Supports paragraph splitting on blank lines, bullet detection (`-` / `•`),
 * and inline `**bold**` emphasis. Avoids pulling in a markdown dependency.
 */
function SummaryBody({ text, className }: { text: string; className?: string }) {
  const blocks = useMemo(() => splitBlocks(text), [text]);

  return (
    <div className={cn('space-y-2 text-sm leading-relaxed text-text-secondary', className)}>
      {blocks.map((block, i) => {
        if (block.type === 'list') {
          return (
            <ul key={i} className="ml-4 list-disc space-y-1 text-sm">
              {block.items.map((item, j) => (
                <li key={j}>{renderInline(item)}</li>
              ))}
            </ul>
          );
        }
        return <p key={i}>{renderInline(block.text)}</p>;
      })}
    </div>
  );
}

/** Animated skeleton shown during the initial summary fetch. */
function SummarySkeleton() {
  return (
    <div className="space-y-2" aria-hidden>
      <div className="h-3 w-11/12 animate-pulse rounded bg-bg-surface-raised" />
      <div className="h-3 w-10/12 animate-pulse rounded bg-bg-surface-raised" />
      <div className="h-3 w-7/12 animate-pulse rounded bg-bg-surface-raised" />
      <p className="sr-only">Generating AI analysis…</p>
    </div>
  );
}

// ---- Helpers -----------------------------------------------------------

type Block =
  | { type: 'paragraph'; text: string }
  | { type: 'list'; items: string[] };

/**
 * Split AI text into rendering blocks. Consecutive `-` or `•` lines collapse
 * into a single bullet list; other lines join into paragraphs separated by
 * blank lines.
 */
function splitBlocks(text: string): Block[] {
  const lines = text.split(/\r?\n/);
  const blocks: Block[] = [];
  let paragraph: string[] = [];
  let list: string[] = [];

  const flushParagraph = () => {
    if (paragraph.length === 0) return;
    blocks.push({ type: 'paragraph', text: paragraph.join(' ').trim() });
    paragraph = [];
  };
  const flushList = () => {
    if (list.length === 0) return;
    blocks.push({ type: 'list', items: list });
    list = [];
  };

  for (const raw of lines) {
    const line = raw.trim();
    if (line === '') {
      flushParagraph();
      flushList();
      continue;
    }

    const bulletMatch = /^[-•]\s+(.*)$/.exec(line);
    if (bulletMatch) {
      flushParagraph();
      list.push(bulletMatch[1]!);
      continue;
    }

    flushList();
    paragraph.push(line);
  }

  flushParagraph();
  flushList();
  return blocks;
}

/**
 * Render inline emphasis. Currently supports `**bold**`. Anything else is
 * passed through as plain text so we never accidentally interpret prices or
 * symbols as markup.
 */
function renderInline(text: string): React.ReactNode {
  if (!text.includes('**')) return text;
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
