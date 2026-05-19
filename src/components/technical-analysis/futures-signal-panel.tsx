'use client';

import { useMemo } from 'react';
import { cn } from '@/lib/shared/utils';
import { formatCurrency } from '@/lib/shared/formatting';
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
  ShieldCheck,
  Clock,
  DatabaseZap,
  WifiOff,
} from 'lucide-react';

interface FuturesSignalPanelProps {
  /**
   * Pre-computed deterministic signal. Hoisted from the page so the same
   * engine output drives both the Futures Setup panel and the AI Summary.
   */
  signal: FuturesSignal;
  symbol: string;
  timeframe: string;
  isLoading?: boolean;
  isUpstreamError?: boolean;
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
  isLoading: _isLoading = false,
  isUpstreamError: _isUpstreamError = false,
}: FuturesSignalPanelProps) {
  const journalAdd = useSignalJournalStore((s) => s.add);
  const journalEntries = useSignalJournalStore((s) => s.entries);

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
          <p className="mt-3 text-[11px] leading-relaxed text-text-muted">
            Educational analysis only. This setup classification is not financial advice or an instruction to trade.
          </p>
        </div>
        <DataFreshnessCard signal={signal} compact />
      </section>
    );
  }

  /**

   * Menjalankan logic handle save signal.

   * Dipakai untuk memisahkan tanggung jawab fungsi ini dari bagian aplikasi lain.

   */

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

      <RiskEducationNotice />
      <SignalStateBanner signal={signal} isLoading={_isLoading} isUpstreamError={_isUpstreamError} />
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
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border-subtle pt-3">
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
          className="flex items-center gap-1.5 rounded-lg border border-accent-secondary/20 bg-accent-secondary/5 px-3 py-2"
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
        <div className="flex items-start gap-2 rounded-lg border border-border-subtle/70 bg-bg-surface-soft/60 px-3 py-2.5">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-text-muted" />
          <p className="text-[11px] leading-relaxed text-text-muted">
            Educational analysis only. This risk-assisted setup classification is
            not financial advice and is not an instruction to trade. Use it as
            market-condition context; confirm independently and manage risk.
          </p>
        </div>
      </div>
    </section>
  );
}


/**
 * RiskEducationNotice keeps financial-safety copy visible near the signal.
 * It clarifies that the output is a setup classification, not advice.
 */
function RiskEducationNotice() {
  return (
    <div className="rounded-lg border border-accent-secondary/20 bg-accent-secondary/5 px-3 py-2" role="note">
      <p className="flex items-start gap-2 text-[11px] leading-relaxed text-text-secondary">
        <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent-secondary" aria-hidden />
        <span>
          <span className="font-semibold text-accent-secondary">Educational analysis only.</span>{' '}
          This is a risk-assisted setup classification, not financial advice and not an instruction to trade.
        </span>
      </p>
    </div>
  );
}

/**
 * SignalStateBanner surfaces loading, stale, insufficient-data, and upstream
 * issues without treating WAIT as a broken state.
 */
function SignalStateBanner({
  signal,
  isLoading,
  isUpstreamError,
}: {
  signal: FuturesSignal;
  isLoading: boolean;
  isUpstreamError: boolean;
}) {
  const isStale = !signal.dataHealth.ok;
  const label = isLoading
    ? 'Refreshing market condition'
    : isUpstreamError
      ? 'Upstream data issue'
      : isStale
        ? 'Stale or insufficient data'
        : signal.action === 'WAIT'
          ? 'WAIT is a valid market condition'
          : 'Data health looks current';

  const detail = isLoading
    ? 'Latest candles and positioning are being refreshed.'
    : isUpstreamError
      ? 'One or more market-data requests failed. Treat this setup classification as degraded.'
      : isStale
        ? signal.dataHealth.reasons[0] ?? 'Required timeframe data is stale or unavailable.'
        : signal.action === 'WAIT'
          ? 'The engine found no clean actionable setup. Standing aside is part of risk control.'
          : 'Freshness checks passed for required timeframes.';

  return (
    <div
      className={cn(
        'rounded-lg border px-3 py-2.5',
        isUpstreamError || isStale
          ? 'border-accent-warm/35 bg-accent-warm/8'
          : signal.action === 'WAIT'
            ? 'border-accent-primary/25 bg-accent-primary/5'
            : 'border-market-up/25 bg-market-up/5'
      )}
      role="status"
    >
      <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-text-secondary">
        {isUpstreamError ? <WifiOff className="h-3 w-3" /> : <DatabaseZap className="h-3 w-3" />}
        {label}
      </p>
      <p className="mt-1 text-xs leading-relaxed text-text-muted">{detail}</p>
    </div>
  );
}

/**
 * DataFreshnessCard shows the exact freshness inputs used by the strict
 * data-health gate so traders can judge whether the classification is current.
 */
function DataFreshnessCard({ signal, compact = false }: { signal: FuturesSignal; compact?: boolean }) {
  const health = signal.dataHealth;
  const freshnessTone = health.ok ? 'text-market-up' : 'text-accent-warm';
  return (
    <div className="rounded-lg border border-border-subtle bg-bg-surface-soft px-3 py-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-text-muted">
          <Clock className="h-3 w-3" />
          Data freshness
        </p>
        <span className={cn('text-[10px] font-semibold uppercase tracking-wider', freshnessTone)}>
          {health.ok ? 'Healthy' : 'Stale / incomplete'}
        </span>
      </div>
      <div className={cn('mt-2 grid gap-2 text-[11px]', compact ? 'grid-cols-1' : 'grid-cols-2 sm:grid-cols-4')}>
        <FreshnessItem label="Last evaluated" value="Current render" sub="client-side engine" />
        <FreshnessItem label="Setup close" value={formatAge(health.setup.lastCandleAgeSec)} sub={health.setup.ok ? 'fresh' : health.setup.reason ?? 'stale'} />
        <FreshnessItem label="Macro / Trigger" value={`${availabilityLabel(health.macro)} / ${availabilityLabel(health.trigger)}`} sub="required MTF context" />
        <FreshnessItem label="Funding / OI" value={`${formatAge(health.funding.ageSec)} / ${formatAge(health.openInterest.ageSec)}`} sub={`${health.funding.ok ? 'funding ok' : 'funding degraded'} ? ${health.openInterest.ok ? 'OI ok' : 'OI degraded'}`} />
      </div>
      {health.confidenceCap < 100 && (
        <p className="mt-2 border-t border-border-subtle pt-2 text-[11px] text-text-muted">
          Confidence is capped at <span className="numeric font-semibold text-text-secondary">{health.confidenceCap}</span> because secondary data is missing or stale.
        </p>
      )}
    </div>
  );
}

/** Renders one concise data-freshness datum with a muted explanation. */
function FreshnessItem({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="rounded-md border border-border-subtle/60 bg-bg-surface-raised/40 px-2 py-1.5">
      <p className="text-[10px] font-medium uppercase tracking-wider text-text-muted">{label}</p>
      <p className="numeric mt-0.5 text-[11px] font-semibold text-text-primary">{value}</p>
      <p className="mt-0.5 truncate text-[10px] text-text-muted" title={sub}>{sub}</p>
    </div>
  );
}

/**
 * WaitReasonsPanel gives WAIT the same visual weight as LONG/SHORT and shows
 * ranked no-trade reasons in order of engine severity.
 */
function WaitReasonsPanel({ signal }: { signal: FuturesSignal }) {
  const reasons = signal.noTradeReasons.length > 0
    ? signal.noTradeReasons
    : signal.primaryNoTradeReason
      ? [signal.primaryNoTradeReason]
      : ['No clean actionable setup is available right now.'];

  return (
    <div className="rounded-xl border border-accent-primary/25 bg-accent-primary/5 px-3 py-3">
      <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-accent-primary">
        <Hourglass className="h-3 w-3" />
        WAIT classification ? stand aside is valid
      </p>
      <p className="mt-1 text-xs leading-relaxed text-text-secondary">
        The risk engine did not find a clean setup. This is a market-condition classification, not a failure.
      </p>
      <ol className="mt-2 space-y-1.5">
        {reasons.map((reason, i) => (
          <li key={`${reason}-${i}`} className="flex gap-2 rounded-lg border border-border-subtle/60 bg-bg-surface-raised/35 px-2 py-1.5 text-xs text-text-secondary">
            <span className="numeric mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-accent-primary/10 text-[10px] font-bold text-accent-primary">
              {i + 1}
            </span>
            <span className="leading-relaxed">{reason}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

/** Format freshness age in trader-friendly units. */
function formatAge(ageSec: number | null): string {
  if (ageSec == null) return 'Unavailable';
  if (ageSec < 60) return `${Math.round(ageSec)}s ago`;
  if (ageSec < 3600) return `${Math.round(ageSec / 60)}m ago`;
  return `${(ageSec / 3600).toFixed(1)}h ago`;
}

/** Convert timeframe health into a compact availability label. */
function availabilityLabel(health: FuturesSignal['dataHealth']['setup']): string {
  if (!health.required) return 'N/A';
  if (health.ok) return 'OK';
  if (health.candleCount <= 0) return 'Missing';
  return 'Stale';
}

// --------------------------------------------------------------------------
// Sub-components
// --------------------------------------------------------------------------

/**

 * Komponen ActionBadge untuk merender bagian UI terkait action badge.

 * Menjaga struktur tampilan tetap terpisah dari halaman atau komponen induk.

 */

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
      aria-label={`Setup classification ${c.label}`}
    >
      {c.icon}
      {c.label}
    </span>
  );
}

/**

 * Komponen GradeBadge untuk merender bagian UI terkait grade badge.

 * Menjaga struktur tampilan tetap terpisah dari halaman atau komponen induk.

 */

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
      aria-label={`Setup grade ${grade}`}
    >
      Grade {grade}
    </span>
  );
}

/**

 * Komponen RiskPill untuk merender bagian UI terkait risk pill.

 * Menjaga struktur tampilan tetap terpisah dari halaman atau komponen induk.

 */

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

/**

 * Komponen TriggerPill untuk merender bagian UI terkait trigger pill.

 * Menjaga struktur tampilan tetap terpisah dari halaman atau komponen induk.

 */

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

/**

 * Komponen ConfidenceMeter untuk merender bagian UI terkait confidence meter.

 * Menjaga struktur tampilan tetap terpisah dari halaman atau komponen induk.

 */

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

/**

 * Komponen PlanStat untuk merender bagian UI terkait plan stat.

 * Menjaga struktur tampilan tetap terpisah dari halaman atau komponen induk.

 */

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

/**

 * Komponen MtfBlock untuk merender bagian UI terkait mtf block.

 * Menjaga struktur tampilan tetap terpisah dari halaman atau komponen induk.

 */

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

/**

 * Komponen BiasCell untuk merender bagian UI terkait bias cell.

 * Menjaga struktur tampilan tetap terpisah dari halaman atau komponen induk.

 */

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

/**

 * Komponen PositioningBlock untuk merender bagian UI terkait positioning block.

 * Menjaga struktur tampilan tetap terpisah dari halaman atau komponen induk.

 */

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

/**

 * Komponen Row untuk merender bagian UI terkait row.

 * Menjaga struktur tampilan tetap terpisah dari halaman atau komponen induk.

 */

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

/**

 * Menjalankan logic funding bias label.

 * Dipakai untuk memisahkan tanggung jawab fungsi ini dari bagian aplikasi lain.

 */

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

/**

 * Menjalankan logic oi bias label.

 * Dipakai untuk memisahkan tanggung jawab fungsi ini dari bagian aplikasi lain.

 */

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

/**
 * ForecastBlock — visualizes the Kronos forecast as supporting evidence.
 *
 * Shows alignment vs. the deterministic action, the forecast direction,
 * the confidence adjustment that was applied, and any warnings. The block
 * is purely informational: it cannot create or modify a trade decision.
 */
function ForecastBlock({ signal }: { signal: FuturesSignal }) {
  const alignment = signal.forecastAlignment;
  if (!alignment) return null;

  const alignmentTone =
    alignment === 'aligned'
      ? { label: 'Aligned', className: 'text-market-up' }
      : alignment === 'conflicting'
        ? { label: 'Conflicting', className: 'text-market-down' }
        : alignment === 'invalid'
          ? { label: 'Invalid', className: 'text-accent-warm' }
          : alignment === 'unavailable'
            ? { label: 'Unavailable', className: 'text-text-muted' }
            : { label: 'Neutral', className: 'text-text-secondary' };

  const direction = signal.forecastDirection;
  const adjustment = signal.forecastConfidenceAdjustment;
  const warnings = signal.forecastWarnings ?? [];

  return (
    <div className="rounded-lg border border-accent-secondary/20 bg-accent-secondary/5 px-3 py-2.5">
      <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-accent-secondary">
        <ShieldCheck className="h-3 w-3" />
        Kronos Forecast
        <span className="ml-2 text-[9px] font-medium text-text-muted">supporting evidence only</span>
      </p>
      <div className="mt-2 grid grid-cols-2 gap-2 text-[11px]">
        <div className="rounded-md border border-border-subtle/60 bg-bg-surface-raised/40 px-2 py-1.5">
          <p className="text-[10px] font-medium uppercase tracking-wider text-text-muted">Alignment</p>
          <p className={cn('mt-0.5 text-[11px] font-semibold uppercase', alignmentTone.className)}>
            {alignmentTone.label}
          </p>
        </div>
        <div className="rounded-md border border-border-subtle/60 bg-bg-surface-raised/40 px-2 py-1.5">
          <p className="text-[10px] font-medium uppercase tracking-wider text-text-muted">Direction</p>
          <p className="mt-0.5 text-[11px] font-semibold uppercase text-text-secondary">
            {direction ?? '—'}
          </p>
        </div>
      </div>
      {adjustment != null && adjustment !== 0 && (
        <p className="mt-2 text-[11px] text-text-muted">
          Confidence adjustment:{' '}
          <span
            className={cn(
              'numeric font-semibold',
              adjustment > 0 ? 'text-market-up' : 'text-market-down'
            )}
          >
            {adjustment > 0 ? `+${adjustment}` : adjustment}
          </span>
        </p>
      )}
      {warnings.length > 0 && (
        <ul className="mt-1 space-y-0.5">
          {warnings.map((w, i) => (
            <li key={i} className="text-[11px] leading-relaxed text-accent-warm/90">
              · {w}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
