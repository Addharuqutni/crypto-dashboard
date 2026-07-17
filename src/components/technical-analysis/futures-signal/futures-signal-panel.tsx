'use client';

import { useMemo } from 'react';
import { cn } from '@/lib/shared/utils';
import { formatCurrency } from '@/lib/shared/formatting';
import { useSignalJournalStore } from '@/stores/use-signal-journal-store';
import type { FuturesSignal } from '@/types/futures-signal';
import {
  Hourglass,
  Shield,
  AlertTriangle,
  Info,
  Target,
  Crosshair,
  Gauge,
  BookmarkPlus,
  Check,
  ShieldCheck,
  Clock,
} from 'lucide-react';
import {
  ActionBadge,
  GradeBadge,
  ConfidenceMeter,
  RiskPill,
  TriggerPill,
  PlanStat,
} from './badges';
import {
  RiskEducationNotice,
  SignalStateBanner,
  DataFreshnessCard,
  WaitReasonsPanel,
  MtfBlock,
  PositioningBlock,
  ForecastBlock,
} from './blocks';

interface FuturesSignalPanelProps {
  signal: FuturesSignal;
  symbol: string;
  timeframe: string;
}

/**
 * Futures Signal Panel V2.
 *
 * Progressive disclosure layout:
 *   - Top: action, grade, confidence, risk
 *   - Middle: entry, SL, TP, RR (only when actionable)
 *   - Confirmation: MTF, funding, OI, liquidity sweep
 *   - Reasoning: reasons, warnings, ranked no-trade reasons
 *
 * Signal computation is hoisted to the parent so AI Summary and this
 * panel always agree. "Kronos informs. Risk engine decides."
 */
export function FuturesSignalPanel({
  signal,
  symbol,
  timeframe,
}: FuturesSignalPanelProps) {
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

  if (signal.regime === 'INSUFFICIENT_DATA') {
    return (
      <section className="card space-y-3 p-4" aria-labelledby="futures-signal-title">
        <header className="flex items-center justify-between">
          <h2
            id="futures-signal-title"
            className="font-[family-name:var(--font-display)] text-sm font-semibold uppercase tracking-wider text-text-muted"
          >
            Futures Setup
          </h2>
          <span className="text-[10px] font-medium uppercase tracking-wider text-text-muted">
            {symbol} · {timeframe}
          </span>
        </header>
        <div className="rounded-lg border border-border-subtle bg-bg-surface-soft px-4 py-5 text-center">
          <Hourglass className="mx-auto h-6 w-6 text-text-muted" />
          <p className="mt-2 text-sm font-medium text-text-secondary">Insufficient data</p>
          <p className="mt-1 text-xs text-text-muted">{signal.invalidationReason}</p>
          <p className="mt-2 text-[11px] leading-relaxed text-text-muted">
            Educational analysis only. Not financial advice or an instruction to trade.
          </p>
        </div>
        <DataFreshnessCard signal={signal} compact />
      </section>
    );
  }

  const handleSaveSignal = () => {
    if (!signal || signal.action === 'WAIT') return;
    journalAdd({
      symbol,
      timeframe,
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
      aria-labelledby="futures-signal-title"
      id="futures-signal-panel"
    >
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h2
          id="futures-signal-title"
          className="font-[family-name:var(--font-display)] text-sm font-semibold uppercase tracking-wider text-text-muted"
        >
          Futures Setup
        </h2>
        <span className="text-[10px] font-medium uppercase tracking-wider text-text-muted">
          {symbol} · {timeframe}
        </span>
      </header>

      <RiskEducationNotice />
      <SignalStateBanner signal={signal} />
      <DataFreshnessCard signal={signal} />

      {/* Section 1 — top row: setup classification, grade, confidence, risk. */}
      <div className="flex flex-wrap items-center gap-3">
        <ActionBadge action={signal.action} />
        <GradeBadge grade={signal.signalGrade} />
        <ConfidenceMeter score={signal.confidenceScore} />
        <RiskPill level={signal.riskLevel} />
        <TriggerPill trigger={signal.entryTrigger} />
      </div>

      <p className="text-sm leading-relaxed text-text-secondary">{signal.summary}</p>

      {/* Section 2 — trade plan (only when actionable). */}
      {signal.action !== 'WAIT' && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
          <PlanStat
            icon={<Crosshair className="h-3.5 w-3.5" />}
            label="Entry Zone"
            value={
              signal.entryZone.min != null && signal.entryZone.max != null
                ? `${formatCurrency(signal.entryZone.min)} — ${formatCurrency(signal.entryZone.max)}`
                : '—'
            }
          />
          <PlanStat
            icon={<Shield className="h-3.5 w-3.5" />}
            label="Stop Loss"
            value={signal.stopLoss != null ? formatCurrency(signal.stopLoss) : '—'}
            tone="bearish"
          />
          <PlanStat
            icon={<Target className="h-3.5 w-3.5" />}
            label="TP1 / TP2 / TP3"
            value={
              signal.takeProfits.tp1 != null
                ? `${formatCurrency(signal.takeProfits.tp1)} · ${formatCurrency(signal.takeProfits.tp2 ?? 0)} · ${formatCurrency(signal.takeProfits.tp3 ?? 0)}`
                : '—'
            }
            tone="bullish"
          />
          <PlanStat
            icon={<Gauge className="h-3.5 w-3.5" />}
            label="R:R · Leverage"
            value={`${signal.riskRewardRatio?.toFixed(2) ?? '—'}  ·  ${signal.suggestedLeverage.min}x–${signal.suggestedLeverage.max}x`}
          />
        </div>
      )}

      {/* Section 3 — confirmation: MTF / funding / OI / sweep. */}
      <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
        <MtfBlock signal={signal} />
        <PositioningBlock signal={signal} />
      </div>

      {/* Section 3b — Kronos forecast (supporting evidence only). */}
      {signal.forecastAlignment && (
        <ForecastBlock signal={signal} />
      )}

      {/* Section 3c — late-entry guard. */}
      {signal.lateEntryBlocked && (
        <div className="rounded-lg border border-accent-warm/40 bg-accent-warm/10 px-3 py-2.5">
          <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-accent-warm">
            <Clock className="h-3 w-3" />
            Late-entry guard: Blocked
          </p>
          <p className="mt-1 text-xs leading-relaxed text-accent-warm/90">
            {signal.lateEntryReason ?? 'Setup is too extended. Wait for a better location.'}
          </p>
        </div>
      )}

      {/* Section 4 — WAIT is a valid setup classification, not a failure. */}
      {signal.action === 'WAIT' && <WaitReasonsPanel signal={signal} />}

      {/* Section 5 — reasons. */}
      {signal.reasons.length > 0 && (
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">
            Reasons
          </p>
          <ul className="mt-2 space-y-1">
            {signal.reasons.map((reason, i) => (
              <li key={i} className="flex items-start gap-2 text-xs leading-relaxed text-text-secondary">
                <span className="mt-1 inline-block h-1 w-1 shrink-0 rounded-full bg-accent-primary/70" />
                <span>{reason}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Section 6 — warnings. */}
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

      {/* Section 7 — invalidation. */}
      <div className="rounded-lg border border-border-subtle bg-bg-surface-soft px-3 py-2.5">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">
          Invalidation
        </p>
        <p className="mt-1 text-xs leading-relaxed text-text-secondary">
          {signal.invalidationReason}
        </p>
      </div>

      {/* Section 8 — actions: save signal. */}
      {signal.action !== 'WAIT' && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border-subtle pt-2.5">
          <p className="text-[11px] text-text-muted">
            Save this setup to track outcome locally.
          </p>
          <button
            id="futures-signal-save-btn"
            onClick={handleSaveSignal}
            disabled={alreadySaved}
            className={cn(
              'pressable inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-all',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring',
              alreadySaved
                ? 'cursor-not-allowed border border-market-up/30 bg-market-up/5 text-market-up'
                : 'border border-accent-primary/30 bg-accent-primary/10 text-accent-primary shadow-[0_6px_20px_-8px_rgba(56,189,248,0.45)] hover:bg-accent-primary/20 hover:shadow-[0_10px_24px_-6px_rgba(56,189,248,0.55)]'
            )}
            aria-label={alreadySaved ? 'Setup already saved to journal' : 'Save setup to journal'}
          >
            {alreadySaved ? (
              <Check className="h-3.5 w-3.5 animate-in" />
            ) : (
              <BookmarkPlus className="h-3.5 w-3.5" />
            )}
            {alreadySaved ? 'Saved' : 'Save Setup'}
          </button>
        </div>
      )}

      {/* Skill mode notice + Disclaimer */}
      <div className="space-y-2">
        <div
          className="flex items-center gap-1.5 rounded-lg border border-accent-secondary/20 bg-accent-secondary/5 px-3 py-1.5"
          role="note"
          aria-label="AI Agent skill policy"
        >
          <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-accent-secondary" aria-hidden />
          <p className="text-[11px] leading-relaxed text-text-muted">
            Skill: <span className="font-semibold text-accent-secondary">Crypto + Kronos</span>
            <span className="mx-1 text-text-muted/50">·</span>
            Kronos informs.
            <span className="mx-1 text-text-muted/50">·</span>
            <span className="font-semibold text-text-secondary">Risk engine remains final authority.</span>
          </p>
        </div>
        <div className="flex items-start gap-2 rounded-lg border border-border-subtle/70 bg-bg-surface-soft/60 px-3 py-2">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-text-muted" />
          <p className="text-[11px] leading-relaxed text-text-muted">
            Educational analysis only. Not financial advice or an instruction to trade.
          </p>
        </div>
      </div>
    </section>
  );
}
