'use client';

import { useMemo } from 'react';
import { cn } from '@/lib/shared/utils';
import { formatCurrency } from '@/lib/shared/formatting';
import { useSignalJournalStore } from '@/stores/use-signal-journal-store';
import type { ActionCallView } from '@/types/action-call';
import {
  Hourglass,
  Shield,
  AlertTriangle,
  Target,
  Crosshair,
  Gauge,
  BookmarkPlus,
  Check,
  Info,
} from 'lucide-react';
import { ActionBadge, ConfidenceMeter, PlanStat, RiskPill } from './badges';

interface ActionCallPanelProps {
  signal: ActionCallView;
  symbol: string;
  timeframe: string;
  isLoading?: boolean;
  error?: string | null;
}

/**
 * Action Call panel powered by the Python MTF engine.
 *
 * Layout mirrors the previous Futures Setup panel so the UX stays familiar,
 * but the source of truth is now the Python agent (not the deleted TS V2 engine).
 */
export function ActionCallPanel({
  signal,
  symbol,
  timeframe,
  isLoading = false,
  error = null,
}: ActionCallPanelProps) {
  const journalAdd = useSignalJournalStore((s) => s.add);
  const journalEntries = useSignalJournalStore((s) => s.entries);

  const alreadySaved = useMemo(() => {
    if (!signal || signal.action === 'WAIT') return false;
    const targetEntry = signal.entryZone.min;
    if (targetEntry == null) return false;
    return journalEntries.some(
      (e) =>
        e.symbol === symbol &&
        e.timeframe === timeframe &&
        e.action === signal.action &&
        e.entryPrice != null &&
        Math.abs(e.entryPrice - targetEntry) < 1e-9
    );
  }, [journalEntries, signal, symbol, timeframe]);

  if (isLoading) {
    return (
      <section className="card space-y-3 p-4" aria-labelledby="action-call-title">
        <Header symbol={symbol} timeframe={timeframe} />
        <div className="rounded-lg border border-border-subtle bg-bg-surface-soft px-4 py-6 text-center">
          <Hourglass className="mx-auto h-5 w-5 animate-pulse text-text-muted" />
          <p className="mt-2 text-sm text-text-secondary">Loading Python Action Call…</p>
        </div>
      </section>
    );
  }

  if (error) {
    return (
      <section className="card space-y-3 p-4" aria-labelledby="action-call-title">
        <Header symbol={symbol} timeframe={timeframe} />
        <div className="rounded-lg border border-market-down/30 bg-market-down/5 px-4 py-5 text-center">
          <AlertTriangle className="mx-auto h-5 w-5 text-market-down" />
          <p className="mt-2 text-sm font-medium text-market-down">Action Call unavailable</p>
          <p className="mt-1 text-xs text-text-muted">{error}</p>
          <p className="mt-2 text-[11px] text-text-muted">
            Ensure the Python agent is running on the configured PYTHON_AGENT_URL.
          </p>
        </div>
      </section>
    );
  }

  const handleSaveSignal = () => {
    if (!signal || signal.action === 'WAIT') return;
    journalAdd({
      symbol,
      timeframe: signal.timeframe || timeframe,
      action: signal.action,
      confidenceScore: signal.confidenceScore,
      signalGrade: signal.signalGrade,
      entryPrice: signal.entryZone.min ?? null,
      stopLoss: signal.stopLoss,
      tp1: signal.takeProfits.tp1,
      tp2: signal.takeProfits.tp2,
      tp3: signal.takeProfits.tp3,
      reasons: signal.reasons,
      warnings: signal.warnings,
    });
  };

  return (
    <section
      className="card space-y-3 p-4"
      aria-labelledby="action-call-title"
      id="action-call-panel"
    >
      <Header symbol={symbol} timeframe={signal.timeframe || timeframe} engineTag="Python MTF" />

      <div className="rounded-lg border border-border-subtle bg-bg-surface-soft px-3 py-2 text-[11px] leading-relaxed text-text-muted">
        <Info className="mr-1 inline h-3 w-3" />
        Educational setup only. Not financial advice. Source: Python Action Call (5m/15m/30m/1h/4h).
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <ActionBadge action={signal.action} />
        <span
          className={cn(
            'inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider',
            signal.status === 'READY'
              ? 'border-market-up/30 bg-market-up/5 text-market-up'
              : signal.status === 'WAIT_CONFIRMATION'
                ? 'border-accent-warm/30 bg-accent-warm/5 text-accent-warm'
                : 'border-text-muted/30 bg-bg-surface-raised text-text-muted'
          )}
        >
          {signal.status.replace(/_/g, ' ')}
        </span>
        <ConfidenceMeter score={signal.confidenceScore} />
        <RiskPill level={signal.riskLevel} />
        {signal.bias !== 'NEUTRAL' && (
          <span className="text-[10px] font-semibold uppercase tracking-wider text-text-muted">
            Bias {signal.bias}
          </span>
        )}
      </div>

      <p className="text-sm leading-relaxed text-text-secondary">{signal.summary}</p>

      {signal.action !== 'WAIT' && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
          <PlanStat
            icon={<Crosshair className="h-3.5 w-3.5" />}
            label="Entry"
            value={signal.entryZone.min != null ? formatCurrency(signal.entryZone.min) : '—'}
          />
          <PlanStat
            icon={<Shield className="h-3.5 w-3.5" />}
            label="Stop Loss"
            value={signal.stopLoss != null ? formatCurrency(signal.stopLoss) : '—'}
            tone="bearish"
          />
          <PlanStat
            icon={<Target className="h-3.5 w-3.5" />}
            label="Take Profit"
            value={signal.takeProfits.tp1 != null ? formatCurrency(signal.takeProfits.tp1) : '—'}
            tone="bullish"
          />
          <PlanStat
            icon={<Gauge className="h-3.5 w-3.5" />}
            label="R:R · Regime"
            value={`${signal.riskRewardRatio?.toFixed(2) ?? '—'}  ·  ${signal.regime}`}
          />
        </div>
      )}

      {signal.action === 'WAIT' && signal.noTradeReasons.length > 0 && (
        <div className="rounded-lg border border-border-subtle bg-bg-surface-soft px-3 py-2.5">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">
            Why WAIT
          </p>
          <ul className="mt-1.5 space-y-1">
            {signal.noTradeReasons.map((reason, i) => (
              <li key={i} className="text-xs leading-relaxed text-text-secondary">
                {reason}
              </li>
            ))}
          </ul>
        </div>
      )}

      {signal.reasons.length > 0 && (
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">
            Reasons
          </p>
          <ul className="mt-2 space-y-1">
            {signal.reasons.map((reason, i) => (
              <li
                key={i}
                className="flex items-start gap-2 text-xs leading-relaxed text-text-secondary"
              >
                <span className="mt-1 inline-block h-1 w-1 shrink-0 rounded-full bg-accent-primary/70" />
                <span>{reason}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {signal.warnings.length > 0 && (
        <div className="rounded-lg border border-accent-warm/30 bg-accent-warm/5 px-3 py-2.5">
          <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-accent-warm">
            <AlertTriangle className="h-3 w-3" />
            Warnings
          </p>
          <ul className="mt-1.5 space-y-1">
            {signal.warnings.map((w, i) => (
              <li key={i} className="text-xs leading-relaxed text-accent-warm/90">
                {w}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="rounded-lg border border-border-subtle bg-bg-surface-soft px-3 py-2.5">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">
          Invalidation
        </p>
        <p className="mt-1 text-xs leading-relaxed text-text-secondary">
          {signal.invalidationReason}
        </p>
      </div>

      {signal.action !== 'WAIT' && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border-subtle pt-2.5">
          <p className="text-[11px] text-text-muted">Save this setup to track outcome locally.</p>
          <button
            id="action-call-save-btn"
            onClick={handleSaveSignal}
            disabled={alreadySaved}
            className={cn(
              'pressable inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-all',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring',
              alreadySaved
                ? 'cursor-not-allowed border border-market-up/30 bg-market-up/5 text-market-up'
                : 'border border-accent-primary/30 bg-accent-primary/10 text-accent-primary hover:bg-accent-primary/20'
            )}
            aria-label={alreadySaved ? 'Setup already saved to journal' : 'Save setup to journal'}
          >
            {alreadySaved ? (
              <Check className="h-3.5 w-3.5" />
            ) : (
              <BookmarkPlus className="h-3.5 w-3.5" />
            )}
            {alreadySaved ? 'Saved' : 'Save Setup'}
          </button>
        </div>
      )}
    </section>
  );
}

function Header({
  symbol,
  timeframe,
  engineTag,
}: {
  symbol: string;
  timeframe: string;
  engineTag?: string;
}) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-2">
      <h2
        id="action-call-title"
        className="font-[family-name:var(--font-display)] text-sm font-semibold uppercase tracking-wider text-text-muted"
      >
        Action Call
      </h2>
      <span className="text-[10px] font-medium uppercase tracking-wider text-text-muted">
        {symbol} · {timeframe}
        {engineTag ? ` · ${engineTag}` : ''}
      </span>
    </header>
  );
}
