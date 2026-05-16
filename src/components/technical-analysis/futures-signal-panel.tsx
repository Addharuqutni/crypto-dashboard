'use client';

import { useMemo } from 'react';
import { cn } from '@/lib/utils';
import { formatCurrency } from '@/lib/formatting';
import { generateFuturesSignal } from '@/lib/analysis/futures-signal-engine';
import { useSignalJournalStore } from '@/stores/use-signal-journal-store';
import type {
  FuturesEntryTrigger,
  FuturesFundingBias,
  FuturesOpenInterestBias,
  FuturesRiskLevel,
  FuturesSignal,
  FuturesSignalAction,
  FuturesSignalGrade,
} from '@/types/futures-signal';
import type { Candle } from '@/types/chart';
import type { RsiResult } from '@/lib/indicators/rsi';
import type { MacdPoint } from '@/lib/indicators/macd';
import type { SupportResistance } from '@/lib/indicators/support-resistance';
import {
  TrendingUp,
  TrendingDown,
  Hourglass,
  Shield,
  AlertTriangle,
  Info,
  Target,
  Crosshair,
  Gauge,
  Layers,
  Activity,
  Zap,
  BookmarkPlus,
  Check,
} from 'lucide-react';

interface FuturesSignalPanelProps {
  candles: Candle[];
  symbol: string;
  timeframe: string;
  livePrice?: number;
  rsi?: RsiResult;
  macd?: MacdPoint | null;
  supportResistance?: SupportResistance;
  /** Macro timeframe candles (recommended 4H). */
  macroCandles?: Candle[];
  /** Trigger timeframe candles (recommended 15m). */
  triggerCandles?: Candle[];
  /** Latest funding rate as decimal. */
  fundingRate?: number | null;
  /** % change in open interest over a recent window. */
  openInterestChangePercent?: number | null;
}

/**
 * Futures Signal Panel V2.
 *
 * Progressive disclosure layout:
 *   - Top: action, grade, confidence, risk
 *   - Middle: entry, SL, TP, RR (only when actionable)
 *   - Confirmation: MTF, funding, OI, liquidity sweep
 *   - Reasoning: reasons, warnings, ranked no-trade reasons
 */
export function FuturesSignalPanel({
  candles,
  symbol,
  timeframe,
  livePrice,
  rsi,
  macd,
  supportResistance,
  macroCandles,
  triggerCandles,
  fundingRate,
  openInterestChangePercent,
}: FuturesSignalPanelProps) {
  const journalAdd = useSignalJournalStore((s) => s.add);
  const journalEntries = useSignalJournalStore((s) => s.entries);

  const signal = useMemo<FuturesSignal | null>(() => {
    if (!candles || candles.length === 0) return null;
    return generateFuturesSignal({
      symbol,
      timeframe,
      candles,
      livePrice,
      rsi,
      macd,
      supportResistance,
      macroCandles,
      triggerCandles,
      fundingRate: fundingRate ?? null,
      openInterestChangePercent: openInterestChangePercent ?? null,
    });
  }, [
    candles,
    symbol,
    timeframe,
    livePrice,
    rsi,
    macd,
    supportResistance,
    macroCandles,
    triggerCandles,
    fundingRate,
    openInterestChangePercent,
  ]);

  // Determine whether the current setup has already been saved.
  //
  // Pure check by symbol/timeframe/action/entry — no time-based gating to keep
  // this memo deterministic for the React purity rules. The journal store
  // itself prevents true duplicates via storage; this is just for UI feedback.
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

  if (!signal) {
    return (
      <div className="card px-4 py-6 text-center" id="futures-signal-empty">
        <AlertTriangle className="mx-auto h-6 w-6 text-warning/60" />
        <p className="mt-2 text-sm font-medium text-text-secondary">
          Futures setup unavailable
        </p>
        <p className="mt-1 text-xs text-text-muted">
          Waiting for candle data on {symbol} ({timeframe}).
        </p>
      </div>
    );
  }

  if (signal.regime === 'INSUFFICIENT_DATA') {
    return (
      <section className="card space-y-3 px-4 py-4" aria-labelledby="futures-signal-title">
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
        <div className="rounded-lg border border-border-subtle bg-bg-surface-soft px-4 py-6 text-center">
          <Hourglass className="mx-auto h-6 w-6 text-text-muted" />
          <p className="mt-2 text-sm font-medium text-text-secondary">Insufficient data</p>
          <p className="mt-1 text-xs text-text-muted">{signal.invalidationReason}</p>
        </div>
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
      entryPrice: signal.entryZone.min ?? livePrice ?? null,
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
      className="card space-y-4 px-4 py-4"
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

      {/* Section 1 — top row: action, grade, confidence, risk. */}
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
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
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
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <MtfBlock signal={signal} />
        <PositioningBlock signal={signal} />
      </div>

      {/* Section 4 — primary no-trade reason (when WAIT). */}
      {signal.action === 'WAIT' && signal.primaryNoTradeReason && (
        <div className="rounded-lg border border-accent-warm/30 bg-accent-warm/5 px-3 py-2.5">
          <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-accent-warm">
            <Hourglass className="h-3 w-3" />
            Primary reason
          </p>
          <p className="mt-1 text-xs leading-relaxed text-accent-warm/90">
            {signal.primaryNoTradeReason}
          </p>
          {signal.noTradeReasons.length > 1 && (
            <ul className="mt-2 space-y-1 border-t border-accent-warm/20 pt-2">
              {signal.noTradeReasons.slice(1).map((r, i) => (
                <li key={i} className="text-[11px] leading-relaxed text-accent-warm/70">
                  · {r}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

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
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border-subtle pt-3">
          <p className="text-[11px] text-text-muted">
            Save this setup to track outcome locally.
          </p>
          <button
            id="futures-signal-save-btn"
            onClick={handleSaveSignal}
            disabled={alreadySaved}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring',
              alreadySaved
                ? 'cursor-not-allowed border border-market-up/30 bg-market-up/5 text-market-up'
                : 'border border-accent-primary/30 bg-accent-primary/10 text-accent-primary hover:bg-accent-primary/20'
            )}
            aria-label={alreadySaved ? 'Signal already saved to journal' : 'Save signal to journal'}
          >
            {alreadySaved ? <Check className="h-3.5 w-3.5" /> : <BookmarkPlus className="h-3.5 w-3.5" />}
            {alreadySaved ? 'Saved' : 'Save Signal'}
          </button>
        </div>
      )}

      {/* Disclaimer */}
      <div className="flex items-start gap-2 rounded-lg border border-border-subtle/70 bg-bg-surface-soft/60 px-3 py-2.5">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-text-muted" />
        <p className="text-[11px] leading-relaxed text-text-muted">
          Setup guidance only. Bias, risk, and invalidation are estimates from
          public market data. Not financial advice. Trade with discipline and
          confirm independently.
        </p>
      </div>
    </section>
  );
}

// --------------------------------------------------------------------------
// Sub-components
// --------------------------------------------------------------------------

function ActionBadge({ action }: { action: FuturesSignalAction }) {
  const map: Record<FuturesSignalAction, { className: string; icon: React.ReactNode; label: string }> = {
    LONG: {
      className: 'border-market-up/40 bg-market-up/10 text-market-up',
      icon: <TrendingUp className="h-4 w-4" />,
      label: 'LONG',
    },
    SHORT: {
      className: 'border-market-down/40 bg-market-down/10 text-market-down',
      icon: <TrendingDown className="h-4 w-4" />,
      label: 'SHORT',
    },
    WAIT: {
      className: 'border-accent-warm/40 bg-accent-warm/10 text-accent-warm',
      icon: <Hourglass className="h-4 w-4" />,
      label: 'WAIT',
    },
  };
  const c = map[action];
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-bold uppercase tracking-wider',
        c.className
      )}
      aria-label={`Setup action ${c.label}`}
    >
      {c.icon}
      {c.label}
    </span>
  );
}

function GradeBadge({ grade }: { grade: FuturesSignalGrade }) {
  const map: Record<FuturesSignalGrade, string> = {
    'A+': 'border-market-up/50 bg-market-up/10 text-market-up',
    A: 'border-market-up/40 bg-market-up/5 text-market-up',
    B: 'border-accent-primary/40 bg-accent-primary/10 text-accent-primary',
    C: 'border-accent-warm/40 bg-accent-warm/10 text-accent-warm',
    D: 'border-text-muted/30 bg-bg-surface-raised text-text-muted',
  };
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider',
        map[grade]
      )}
      aria-label={`Signal grade ${grade}`}
    >
      Grade {grade}
    </span>
  );
}

function RiskPill({ level }: { level: FuturesRiskLevel }) {
  const map: Record<FuturesRiskLevel, { label: string; className: string }> = {
    LOW: { label: 'Low Risk', className: 'border-market-up/30 bg-market-up/5 text-market-up' },
    MEDIUM: { label: 'Medium Risk', className: 'border-accent-warm/30 bg-accent-warm/5 text-accent-warm' },
    HIGH: { label: 'High Risk', className: 'border-market-down/40 bg-market-down/10 text-market-down' },
    NO_TRADE: { label: 'No Trade', className: 'border-text-muted/30 bg-bg-surface-raised text-text-muted' },
  };
  const c = map[level];
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider',
        c.className
      )}
    >
      {c.label}
    </span>
  );
}

function TriggerPill({ trigger }: { trigger: FuturesEntryTrigger }) {
  if (trigger === 'NO_TRIGGER') return null;
  const label = trigger.toLowerCase().replace(/_/g, ' ');
  return (
    <span className="inline-flex items-center gap-1 rounded-md border border-accent-secondary/30 bg-accent-secondary/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-accent-secondary">
      <Zap className="h-3 w-3" />
      {label}
    </span>
  );
}

function ConfidenceMeter({ score }: { score: number }) {
  const clamped = Math.max(0, Math.min(100, score));
  const tone =
    clamped >= 75
      ? 'bg-market-up'
      : clamped >= 60
        ? 'bg-accent-primary'
        : clamped >= 45
          ? 'bg-accent-warm'
          : 'bg-market-down';
  return (
    <div className="flex items-center gap-2" aria-label={`Confidence score ${clamped} of 100`}>
      <span className="text-[10px] font-semibold uppercase tracking-wider text-text-muted">Confidence</span>
      <div className="h-1.5 w-24 overflow-hidden rounded-full bg-bg-surface-raised">
        <div className={cn('h-full rounded-full transition-all', tone)} style={{ width: `${clamped}%` }} />
      </div>
      <span className="numeric text-xs font-semibold text-text-primary">{clamped}</span>
    </div>
  );
}

function PlanStat({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone?: 'bullish' | 'bearish';
}) {
  return (
    <div className="rounded-lg border border-border-subtle bg-bg-surface-soft px-3 py-2">
      <p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-text-muted">
        {icon}
        {label}
      </p>
      <p
        className={cn(
          'numeric mt-1 text-sm font-semibold',
          tone === 'bullish' && 'text-market-up',
          tone === 'bearish' && 'text-market-down',
          !tone && 'text-text-primary'
        )}
      >
        {value}
      </p>
    </div>
  );
}

function MtfBlock({ signal }: { signal: FuturesSignal }) {
  const mtf = signal.mtfConfirmation;
  return (
    <div className="rounded-lg border border-border-subtle bg-bg-surface-soft px-3 py-2.5">
      <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-text-muted">
        <Layers className="h-3 w-3" />
        MTF Confirmation
      </p>
      <div className="mt-2 grid grid-cols-3 gap-2 text-[11px]">
        <BiasCell label="Macro" value={mtf.macroBias} />
        <BiasCell label="Setup" value={mtf.setupBias} />
        <BiasCell label="Trigger" value={mtf.triggerBias} />
      </div>
      <div className="mt-2 flex items-center justify-between">
        <span className="text-[10px] font-medium uppercase tracking-wider text-text-muted">Alignment</span>
        <span className="numeric text-xs font-semibold text-text-primary">
          {mtf.alignmentScore.toFixed(0)} / 100
        </span>
      </div>
      {mtf.conflicts.length > 0 && (
        <ul className="mt-2 space-y-0.5 border-t border-border-subtle pt-2">
          {mtf.conflicts.map((c, i) => (
            <li key={i} className="text-[11px] text-accent-warm/90">
              · {c}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function BiasCell({ label, value }: { label: string; value: FuturesSignal['mtfConfirmation']['macroBias'] }) {
  const map: Record<typeof value, string> = {
    BULLISH: 'text-market-up',
    BEARISH: 'text-market-down',
    NEUTRAL: 'text-text-muted',
    INSUFFICIENT_DATA: 'text-text-muted/60',
  };
  return (
    <div className="rounded-md border border-border-subtle/60 bg-bg-surface-raised/40 px-2 py-1.5">
      <p className="text-[10px] font-medium uppercase tracking-wider text-text-muted">{label}</p>
      <p className={cn('mt-0.5 text-[11px] font-semibold uppercase', map[value])}>
        {value === 'INSUFFICIENT_DATA' ? '—' : value.toLowerCase()}
      </p>
    </div>
  );
}

function PositioningBlock({ signal }: { signal: FuturesSignal }) {
  const fundingPct =
    signal.positioning.fundingRate != null
      ? (signal.positioning.fundingRate * 100).toFixed(4) + '%'
      : '—';
  const oiPct =
    signal.positioning.openInterestChangePercent != null
      ? `${signal.positioning.openInterestChangePercent >= 0 ? '+' : ''}${signal.positioning.openInterestChangePercent.toFixed(2)}%`
      : '—';

  const sweepLabel =
    signal.liquiditySweep.type === 'BULLISH_SWEEP'
      ? 'Bullish Sweep'
      : signal.liquiditySweep.type === 'BEARISH_SWEEP'
        ? 'Bearish Sweep'
        : 'No Sweep';
  const sweepClass =
    signal.liquiditySweep.type === 'BULLISH_SWEEP'
      ? 'text-market-up'
      : signal.liquiditySweep.type === 'BEARISH_SWEEP'
        ? 'text-market-down'
        : 'text-text-muted';

  return (
    <div className="rounded-lg border border-border-subtle bg-bg-surface-soft px-3 py-2.5">
      <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-text-muted">
        <Activity className="h-3 w-3" />
        Positioning & Liquidity
      </p>
      <div className="mt-2 space-y-1.5 text-[11px]">
        <Row label="Funding Rate" value={fundingPct} sub={fundingBiasLabel(signal.positioning.fundingBias)} />
        <Row label="OI Change" value={oiPct} sub={oiBiasLabel(signal.positioning.openInterestBias)} />
        <Row
          label="Liquidity Sweep"
          value={sweepLabel}
          valueClassName={sweepClass}
          sub={
            signal.liquiditySweep.sweptLevel != null
              ? `Level ${formatCurrency(signal.liquiditySweep.sweptLevel)} · conf ${signal.liquiditySweep.confidence}`
              : '—'
          }
        />
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  sub,
  valueClassName,
}: {
  label: string;
  value: string;
  sub?: string;
  valueClassName?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-text-muted">{label}</span>
      <span className="text-right">
        <span className={cn('numeric font-semibold text-text-primary', valueClassName)}>{value}</span>
        {sub && <span className="ml-2 text-[10px] uppercase tracking-wider text-text-muted">{sub}</span>}
      </span>
    </div>
  );
}

function fundingBiasLabel(b: FuturesFundingBias): string {
  switch (b) {
    case 'CROWDED_LONG':
      return 'Crowded long';
    case 'CROWDED_SHORT':
      return 'Crowded short';
    case 'SUPPORTS_LONG':
      return 'Supports long';
    case 'SUPPORTS_SHORT':
      return 'Supports short';
    case 'NEUTRAL':
      return 'Neutral';
    default:
      return '—';
  }
}

function oiBiasLabel(b: FuturesOpenInterestBias): string {
  switch (b) {
    case 'BULLISH_CONTINUATION':
      return 'Bullish continuation';
    case 'BEARISH_CONTINUATION':
      return 'Bearish continuation';
    case 'SHORT_COVERING':
      return 'Short covering';
    case 'LONG_LIQUIDATION':
      return 'Long liquidation';
    case 'NEUTRAL':
      return 'Neutral';
    default:
      return '—';
  }
}
