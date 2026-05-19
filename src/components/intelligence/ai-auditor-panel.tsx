'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Bot, Sparkles, AlertTriangle, RefreshCw, Shield, ShieldAlert, Check, X } from 'lucide-react';
import { useAiStore } from '@/stores/use-ai-store';
import { sendChatCompletion } from '@/lib/adapters/ai/ai-client';
import {
  AUDITOR_SYSTEM_PROMPT,
  buildAuditorUserPrompt,
  parseAuditorResponse,
  AiAuditorParseError,
} from '@/lib/domain/intelligence/ai-auditor';
import { cn } from '@/lib/shared/utils';
import type { AiAuditorInput, AiAuditorReport } from '@/types/intelligence';

/**
 * AI Signal Auditor panel.
 *
 * The deterministic signal is rendered separately by `FuturesSignalPanel`.
 * This panel shows AI commentary only, with explicit safety markers:
 *
 *   - A "ANALYSIS ONLY" badge sits at the top so the user always knows AI
 *     is not the decision maker.
 *   - When the verifier detects price fabrication, a warning banner stays
 *     visible regardless of the model's prose.
 *   - If the AI conflicts with the deterministic action, the deterministic
 *     action is restated and the AI's verdict is shown as advisory only.
 */
export interface AiAuditorPanelProps {
  input: AiAuditorInput | null;
}

export function AiAuditorPanel({ input }: AiAuditorPanelProps) {
  const config = useAiStore((s) => s.config);
  const isConfigured = useAiStore((s) => s.isConfigured);

  const [report, setReport] = useState<AiAuditorReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const signature = useMemo(() => {
    if (!input) return null;
    const sig = input.signal;
    return [
      input.symbol,
      sig.action,
      sig.confidence,
      sig.grade,
      sig.entryZone?.min ?? 0,
      sig.stopLoss ?? 0,
      input.marketContext.riskMode,
      input.ranking.score,
    ].join(':');
  }, [input]);

  const fetchAudit = useCallback(async () => {
    if (!input || !isConfigured) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setError(null);
    try {
      const userPrompt = buildAuditorUserPrompt(input);
      const raw = await sendChatCompletion(
        config,
        [
          { role: 'system', content: AUDITOR_SYSTEM_PROMPT },
          { role: 'user', content: userPrompt },
        ],
        { temperature: 0.2, maxTokens: 600 }
      );
      if (controller.signal.aborted) return;
      const parsed = parseAuditorResponse(raw, input);
      setReport(parsed);
    } catch (err) {
      if (controller.signal.aborted) return;
      if (err instanceof AiAuditorParseError) {
        setError(`Auditor response was not parseable: ${err.message}`);
      } else {
        setError(err instanceof Error ? err.message : 'Failed to run audit.');
      }
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, [input, isConfigured, config]);

  // Auto-fetch on signature change. Reset stale report so the user never
  // sees a verdict that no longer matches the current signal.
  useEffect(() => {
    if (!isConfigured || !input) return;
    setReport(null);
    void fetchAudit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);

  useEffect(
    () => () => {
      abortRef.current?.abort();
    },
    []
  );

  const detAction = input?.signal.action ?? null;

  return (
    <section className="card space-y-3 px-4 py-4" aria-labelledby="ai-auditor-title">
      <header className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-md bg-accent-secondary/10 text-accent-secondary">
            <Bot className="h-3.5 w-3.5" />
          </span>
          <div>
            <h2
              id="ai-auditor-title"
              className="flex items-center gap-2 font-[family-name:var(--font-display)] text-sm font-semibold uppercase tracking-wider text-text-muted"
            >
              AI Auditor
              <span className="rounded-sm border border-yellow-500/40 bg-yellow-500/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-yellow-300">
                Analysis Only
              </span>
            </h2>
            <p className="text-[10px] text-text-muted">
              Explains the deterministic engine. Does not decide trades.
            </p>
          </div>
        </div>
        {isConfigured && input && (
          <button
            type="button"
            onClick={() => void fetchAudit()}
            disabled={loading}
            className={cn(
              'flex items-center gap-1 rounded-md border border-border-subtle bg-bg-surface-soft px-2 py-1 text-[11px] font-medium text-text-secondary',
              'hover:border-accent-primary/30 hover:text-text-primary',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring',
              loading && 'cursor-wait opacity-60'
            )}
            aria-label="Re-run audit"
          >
            <RefreshCw className={cn('h-3 w-3', loading && 'animate-spin')} />
            Re-run
          </button>
        )}
      </header>

      {!isConfigured && (
        <div className="rounded-lg border border-border-subtle bg-bg-surface-soft px-3 py-3 text-center">
          <Sparkles className="mx-auto h-4 w-4 text-text-muted" />
          <p className="mt-1 text-xs text-text-muted">
            Configure the AI Agent to enable auditing of deterministic signals.
          </p>
        </div>
      )}

      {isConfigured && !input && (
        <p className="rounded-lg border border-border-subtle bg-bg-surface-soft px-3 py-2 text-center text-[11px] text-text-muted">
          No signal to audit yet.
        </p>
      )}

      {isConfigured && input && (
        <>
          <DeterministicSummary input={input} />

          {loading && !report && <AuditSkeleton />}

          {report && <ReportBody report={report} detAction={detAction} />}

          {error && !loading && (
            <div
              className="flex items-start gap-2 rounded-md border border-red-500/30 bg-red-500/5 px-3 py-2"
              role="alert"
            >
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-red-400" />
              <div className="flex-1">
                <p className="text-xs font-medium text-red-300">Audit failed</p>
                <p className="mt-0.5 text-[11px] leading-relaxed text-text-muted">{error}</p>
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}

function DeterministicSummary({ input }: { input: AiAuditorInput }) {
  const sig = input.signal;
  return (
    <div className="rounded-lg border border-border-subtle bg-bg-surface-soft px-3 py-2.5">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-text-muted">
        Deterministic decision (engine)
      </p>
      <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px]">
        <span
          className={cn(
            'rounded-sm px-1.5 py-0.5 text-[10px] font-bold uppercase',
            sig.action === 'LONG' && 'bg-market-up/10 text-market-up',
            sig.action === 'SHORT' && 'bg-market-down/10 text-market-down',
            sig.action === 'WAIT' && 'bg-bg-surface-raised text-text-muted'
          )}
        >
          {sig.action}
        </span>
        <span className="text-text-secondary">
          conf <strong className="text-text-primary">{Math.round(sig.confidence ?? 0)}</strong>
        </span>
        <span className="text-text-secondary">
          grade <strong className="text-text-primary">{sig.grade}</strong>
        </span>
        <span className="text-text-secondary">
          rank <strong className="text-text-primary">{input.ranking.score}</strong> ({input.ranking.grade})
        </span>
        <span className="text-text-muted">·</span>
        <span className="text-text-secondary">{input.marketContext.btc4hRegime.replace(/_/g, ' ')}</span>
      </div>
    </div>
  );
}

function ReportBody({
  report,
  detAction,
}: {
  report: AiAuditorReport;
  detAction: AiAuditorInput['signal']['action'] | null;
}) {
  return (
    <div className="space-y-3">
      {report.detectedPriceFabrication && (
        <Banner tone="bearish" icon={<ShieldAlert className="h-3.5 w-3.5" />}>
          <strong>Price fabrication detected.</strong> The AI mentioned a price not in the deterministic plan.
          Use the deterministic engine output as the source of truth.
        </Banner>
      )}

      {report.conflict && (
        <Banner tone="bearish" icon={<ShieldAlert className="h-3.5 w-3.5" />}>
          <strong>AI ↔ engine conflict.</strong> {report.conflict.note}
        </Banner>
      )}

      <div className="grid gap-2 sm:grid-cols-2">
        <Slot
          label="Internally consistent?"
          value={report.consistent ? 'Yes' : 'No'}
          tone={report.consistent ? 'bullish' : 'bearish'}
          icon={
            report.consistent ? (
              <Check className="h-3.5 w-3.5 text-market-up" />
            ) : (
              <X className="h-3.5 w-3.5 text-market-down" />
            )
          }
          detail={report.consistencyExplanation}
        />
        <Slot
          label="Should a disciplined trader wait?"
          value={report.shouldWait ? 'Yes — wait' : 'No — engine plan stands'}
          tone={
            report.shouldWait
              ? 'caution'
              : detAction === 'WAIT'
                ? 'caution'
                : 'bullish'
          }
          icon={<Shield className="h-3.5 w-3.5" />}
          detail={report.shouldWaitReason}
        />
      </div>

      <SlotBlock label="Strongest argument FOR" tone="bullish" text={report.bestArgumentFor} />
      <SlotBlock label="Strongest argument AGAINST" tone="bearish" text={report.bestArgumentAgainst} />
      <SlotBlock label="What invalidates the setup" tone="caution" text={report.invalidationCondition} />

      {report.caveats.length > 0 && (
        <div className="rounded-lg border border-border-subtle bg-bg-surface-soft px-3 py-2.5">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-text-muted">Caveats</p>
          <ul className="mt-1 space-y-1 text-[11px] text-text-secondary">
            {report.caveats.map((c) => (
              <li key={c}>• {c}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function Slot({
  label,
  value,
  tone,
  icon,
  detail,
}: {
  label: string;
  value: string;
  tone: 'bullish' | 'bearish' | 'caution';
  icon: React.ReactNode;
  detail: string;
}) {
  return (
    <div className="rounded-lg border border-border-subtle bg-bg-surface-soft px-3 py-2.5">
      <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-text-muted">
        {icon}
        {label}
      </p>
      <p
        className={cn(
          'mt-1 text-sm font-semibold',
          tone === 'bullish' && 'text-market-up',
          tone === 'bearish' && 'text-market-down',
          tone === 'caution' && 'text-yellow-400'
        )}
      >
        {value}
      </p>
      {detail && <p className="mt-1 text-[11px] leading-relaxed text-text-secondary">{detail}</p>}
    </div>
  );
}

function SlotBlock({
  label,
  tone,
  text,
}: {
  label: string;
  tone: 'bullish' | 'bearish' | 'caution';
  text: string;
}) {
  if (!text) return null;
  return (
    <div
      className={cn(
        'rounded-lg border px-3 py-2.5',
        tone === 'bullish' && 'border-market-up/20 bg-market-up/5',
        tone === 'bearish' && 'border-market-down/20 bg-market-down/5',
        tone === 'caution' && 'border-yellow-500/20 bg-yellow-500/5'
      )}
    >
      <p
        className={cn(
          'text-[10px] font-semibold uppercase tracking-wider',
          tone === 'bullish' && 'text-market-up',
          tone === 'bearish' && 'text-market-down',
          tone === 'caution' && 'text-yellow-400'
        )}
      >
        {label}
      </p>
      <p className="mt-1 text-[12px] leading-relaxed text-text-secondary">{text}</p>
    </div>
  );
}

function Banner({
  tone,
  icon,
  children,
}: {
  tone: 'bearish' | 'caution';
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        'flex items-start gap-2 rounded-md border px-3 py-2 text-[11px] leading-relaxed',
        tone === 'bearish' && 'border-red-500/30 bg-red-500/5 text-red-300',
        tone === 'caution' && 'border-yellow-500/30 bg-yellow-500/5 text-yellow-300'
      )}
    >
      <span className="mt-0.5 flex-shrink-0">{icon}</span>
      <span className="flex-1">{children}</span>
    </div>
  );
}

function AuditSkeleton() {
  return (
    <div className="space-y-2" aria-hidden>
      <div className="h-12 animate-pulse rounded-md bg-bg-surface-raised" />
      <div className="h-16 animate-pulse rounded-md bg-bg-surface-raised" />
      <div className="h-16 animate-pulse rounded-md bg-bg-surface-raised" />
    </div>
  );
}
