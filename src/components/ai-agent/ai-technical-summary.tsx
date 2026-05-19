'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useAiStore } from '@/stores/use-ai-store';
import { sendChatCompletion } from '@/lib/adapters/ai/ai-client';
import { buildSystemPrompt } from '@/lib/adapters/ai/ai-prompt-builder';
import { cn } from '@/lib/shared/utils';
import type { TechnicalContext } from '@/types/ai';
import type { FuturesSignal } from '@/types/futures-signal';
import { Bot, RefreshCw, Sparkles, AlertTriangle, Copy, Check, ShieldCheck } from 'lucide-react';

interface AiTechnicalSummaryProps {
  context: TechnicalContext | null;
  /**
   * Deterministic engine output. When provided, the AI is locked to
   * explain/audit mode and cannot invent action, grade, or levels.
   */
  signal?: FuturesSignal | null;
}

/**
 * Build a stable signature from technical context AND the deterministic
 * signal so we only re-fetch when meaningful values move. Including the
 * engine's action/grade/forecast prevents stale narration after the
 * signal flips.
 */
function getContextSignature(
  ctx: TechnicalContext | null,
  signal?: FuturesSignal | null
): string {
  if (!ctx) return 'null';
  const rsi = ctx.rsi?.value != null ? ctx.rsi.value.toFixed(0) : '-';
  const trend = ctx.trend?.value ?? '-';
  const macd = ctx.macd?.histogram != null ? ctx.macd.histogram.toFixed(2) : '-';
  const sig = signal
    ? `${signal.action}|${signal.signalGrade}|${signal.confidenceScore}|${signal.forecastAlignment ?? '-'}|${signal.lateEntryBlocked ? 'late' : '-'}`
    : '-';
  return `${ctx.symbol}|${ctx.timeframe}|${rsi}|${trend}|${macd}|${sig}`;
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
export function AiTechnicalSummary({ context, signal }: AiTechnicalSummaryProps) {
  const config = useAiStore((s) => s.config);
  const isConfigured = useAiStore((s) => s.isConfigured);

  const [summary, setSummary] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);

  const lastSignature = useRef<string>('');
  const abortRef = useRef<AbortController | null>(null);

  const signature = useMemo(() => getContextSignature(context, signal), [context, signal]);

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
      const userPrompt = signal
        ? buildSignalAuditPrompt(signal, context.symbol)
        : buildContextOnlyPrompt(context.symbol);

      const response = await sendChatCompletion(
        config,
        [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        { temperature: 0.3, maxTokens: 320 }
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
  }, [isConfigured, context, signal, config, signature]);

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
              className="pressable rounded-md p-1.5 text-text-muted transition-colors hover:bg-bg-surface-raised hover:text-text-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
              aria-label={copied ? 'Copied to clipboard' : 'Copy summary'}
              title={copied ? 'Copied!' : 'Copy'}
            >
              {copied ? (
                <Check className="h-3 w-3 text-market-up animate-in" aria-hidden />
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
              'pressable rounded-md p-1.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring',
              loading
                ? 'cursor-not-allowed text-text-muted/30'
                : 'text-text-muted hover:bg-bg-surface-raised hover:text-text-secondary'
            )}
            aria-label="Refresh AI summary"
            title="Refresh"
          >
            <RefreshCw className={cn('h-3 w-3 transition-transform', loading && 'animate-spin')} aria-hidden />
          </button>
        </div>
      </header>

      {/* Skill mode notice — reaffirms that AI explains/audits only and the
          risk engine is the final authority. Visible whenever a deterministic
          signal is attached. */}
      {signal && (
        <div
          className="mt-2 flex items-center gap-1.5 rounded-md border border-accent-secondary/20 bg-accent-secondary/5 px-2 py-1 text-[10px] text-text-muted"
          role="note"
        >
          <ShieldCheck className="h-3 w-3 shrink-0 text-accent-secondary" aria-hidden />
          <span>
            Skill: <span className="font-semibold text-accent-secondary">Crypto + Kronos</span>
            <span className="mx-1 text-text-muted/50">·</span>
            Mode: Explain/Audit only
            <span className="mx-1 text-text-muted/50">·</span>
            Final authority: Risk Engine
          </span>
        </div>
      )}

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

/** Animated skeleton shown during the initial summary fetch.
 *  Uses the shared `.skeleton` shimmer primitive so loading state matches
 *  every other surface in the app.
 */
function SummarySkeleton() {
  return (
    <div className="space-y-2 animate-fade-in" aria-hidden>
      <div className="skeleton h-3 w-11/12" />
      <div className="skeleton h-3 w-10/12" />
      <div className="skeleton h-3 w-7/12" />
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

  /**

   * Menjalankan logic flush paragraph.

   * Dipakai untuk memisahkan tanggung jawab fungsi ini dari bagian aplikasi lain.

   */

  const flushParagraph = () => {
    if (paragraph.length === 0) return;
    blocks.push({ type: 'paragraph', text: paragraph.join(' ').trim() });
    paragraph = [];
  };
  /**
   * Menjalankan logic flush list.
   * Dipakai untuk memisahkan tanggung jawab fungsi ini dari bagian aplikasi lain.
   */
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

// ---- Prompt builders --------------------------------------------------

/**
 * Builds a strict explain/audit prompt grounded in deterministic engine
 * output. The AI must narrate the existing decision and may flag warnings,
 * but it MUST NOT invent action, grade, levels, leverage, confidence, or
 * forecast direction. This is the Crypto + Kronos skill in action.
 */
function buildSignalAuditPrompt(signal: FuturesSignal, symbol: string): string {
  const lines: string[] = [];
  lines.push(`SYMBOL: ${symbol}`);
  lines.push('');
  lines.push('DETERMINISTIC ENGINE OUTPUT (ground truth, do not modify):');
  lines.push(`- Action: ${signal.action}`);
  lines.push(`- Grade: ${signal.signalGrade}`);
  lines.push(`- Confidence: ${signal.confidenceScore}/100`);
  lines.push(`- Risk level: ${signal.riskLevel}`);
  lines.push(`- Regime: ${signal.regime}`);
  lines.push(`- Trade permission: ${signal.tradePermission}`);
  lines.push(`- Entry trigger: ${signal.entryTrigger}`);
  if (signal.action !== 'WAIT') {
    if (signal.entryZone.min != null && signal.entryZone.max != null) {
      lines.push(`- Entry zone: ${signal.entryZone.min} – ${signal.entryZone.max}`);
    }
    if (signal.stopLoss != null) lines.push(`- Stop loss: ${signal.stopLoss}`);
    if (signal.takeProfits.tp1 != null) {
      lines.push(
        `- Take profits: TP1=${signal.takeProfits.tp1}` +
          (signal.takeProfits.tp2 != null ? `, TP2=${signal.takeProfits.tp2}` : '') +
          (signal.takeProfits.tp3 != null ? `, TP3=${signal.takeProfits.tp3}` : '')
      );
    }
    if (signal.riskRewardRatio != null) {
      lines.push(`- Risk:Reward = ${signal.riskRewardRatio.toFixed(2)}`);
    }
    lines.push(
      `- Suggested leverage: ${signal.suggestedLeverage.min}x–${signal.suggestedLeverage.max}x`
    );
  }
  lines.push(`- Invalidation: ${signal.invalidationReason ?? '—'}`);

  if (signal.forecastAlignment) {
    lines.push('');
    lines.push('KRONOS FORECAST (supporting evidence only):');
    lines.push(`- Alignment: ${signal.forecastAlignment}`);
    if (signal.forecastDirection) {
      lines.push(`- Direction: ${signal.forecastDirection}`);
    }
    if (signal.forecastConfidenceAdjustment != null) {
      lines.push(`- Confidence adjustment: ${signal.forecastConfidenceAdjustment}`);
    }
    if (signal.forecastWarnings && signal.forecastWarnings.length > 0) {
      for (const w of signal.forecastWarnings) lines.push(`- Note: ${w}`);
    }
  }

  if (signal.lateEntryBlocked) {
    lines.push('');
    lines.push('LATE-ENTRY GUARD: BLOCKED');
    if (signal.lateEntryReason) lines.push(`- Reason: ${signal.lateEntryReason}`);
  }

  if (signal.reasons.length > 0) {
    lines.push('');
    lines.push('REASONS:');
    for (const r of signal.reasons.slice(0, 6)) lines.push(`- ${r}`);
  }
  if (signal.warnings.length > 0) {
    lines.push('');
    lines.push('WARNINGS:');
    for (const w of signal.warnings.slice(0, 6)) lines.push(`- ${w}`);
  }
  if (signal.action === 'WAIT' && signal.primaryNoTradeReason) {
    lines.push('');
    lines.push(`PRIMARY NO-TRADE REASON: ${signal.primaryNoTradeReason}`);
  }

  lines.push('');
  lines.push('TASK:');
  lines.push(
    'Jelaskan output engine di atas dalam 3–4 kalimat ringkas (Bahasa Indonesia, profesional). Jelaskan kenapa engine memutuskan ' +
      signal.action +
      ', bagaimana Kronos menambah/mengurangi keyakinan, dan apa kondisi invalidation. ' +
      'JANGAN ubah action, grade, confidence, entry, SL, TP, leverage, atau invalidation. ' +
      'JANGAN buat trade baru. JANGAN sarankan PLACE_ORDER, OPEN_POSITION, SET_LEVERAGE. ' +
      'Risk engine adalah satu-satunya otoritas final. Akhiri dengan satu kalimat tentang apa yang harus diawasi user berikutnya.'
  );

  return lines.join('\n');
}

/**
 * Fallback prompt when the deterministic signal isn't available yet.
 * Limits the AI to descriptive analysis (bias and key levels), not trade
 * recommendations.
 */
function buildContextOnlyPrompt(symbol: string): string {
  return [
    `Berikan ringkasan teknikal singkat (3–4 kalimat) untuk ${symbol} berdasarkan data yang dilampirkan.`,
    '',
    'Fokus pada:',
    '1. Bias arah saat ini (bullish / bearish / sideways).',
    '2. Level kunci (support, resistance, level Fibonacci) yang perlu diawasi.',
    '3. Konfirmasi atau divergensi dari indikator (RSI, MACD).',
    '4. Apa yang akan membuat bias berubah (invalidation).',
    '',
    'JANGAN merekomendasikan entry / exit / leverage tertentu. Belum ada output engine deterministik untuk simbol ini, jadi tetap deskriptif. Jawab dalam Bahasa Indonesia, profesional, dan ringkas.',
  ].join('\n');
}
