'use client';

import { cn } from '@/lib/shared/utils';
import { formatCurrency } from '@/lib/shared/formatting';
import type { FuturesSignal } from '@/types/futures-signal';
import { Clock, DatabaseZap, WifiOff, Hourglass, Activity, Layers, ShieldCheck } from 'lucide-react';
import { formatAge, availabilityLabel, fundingBiasLabel, oiBiasLabel } from './bias-labels';
import { Row } from './badges';

export function SignalStateBanner({ signal }: { signal: FuturesSignal }) {
  const isStale = !signal.dataHealth.ok;
  const label = isStale
    ? 'Stale or insufficient data'
    : signal.action === 'WAIT'
      ? 'WAIT is a valid market condition'
      : 'Data health looks current';

  const detail = isStale
    ? signal.dataHealth.reasons[0] ?? 'Required timeframe data is stale or unavailable.'
    : signal.action === 'WAIT'
      ? 'The engine found no clean actionable setup. Standing aside is part of risk control.'
      : 'Freshness checks passed for required timeframes.';

  return (
    <div
      className={cn(
        'rounded-lg border px-3 py-2.5',
        isStale
          ? 'border-accent-warm/35 bg-accent-warm/8'
          : signal.action === 'WAIT'
            ? 'border-accent-primary/25 bg-accent-primary/5'
            : 'border-market-up/25 bg-market-up/5'
      )}
      role="status"
    >
      <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-text-secondary">
        {isStale ? <WifiOff className="h-3 w-3" /> : <DatabaseZap className="h-3 w-3" />}
        {label}
      </p>
      <p className="mt-1 text-xs leading-relaxed text-text-muted">{detail}</p>
    </div>
  );
}

export function RiskEducationNotice() {
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

export function DataFreshnessCard({ signal, compact = false }: { signal: FuturesSignal; compact?: boolean }) {
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
        <FreshnessItem label="Funding / OI" value={`${formatAge(health.funding.ageSec)} / ${formatAge(health.openInterest.ageSec)}`}         sub={`${health.funding.ok ? 'funding ok' : 'funding degraded'} · ${health.openInterest.ok ? 'OI ok' : 'OI degraded'}`} />
      </div>
      {health.confidenceCap < 100 && (
        <p className="mt-2 border-t border-border-subtle pt-2 text-[11px] text-text-muted">
          Confidence is capped at <span className="numeric font-semibold text-text-secondary">{health.confidenceCap}</span> because secondary data is missing or stale.
        </p>
      )}
    </div>
  );
}

function FreshnessItem({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="rounded-md border border-border-subtle/60 bg-bg-surface-raised/40 px-2 py-1.5">
      <p className="text-[10px] font-medium uppercase tracking-wider text-text-muted">{label}</p>
      <p className="numeric mt-0.5 text-[11px] font-semibold text-text-primary">{value}</p>
      <p className="mt-0.5 truncate text-[10px] text-text-muted" title={sub}>{sub}</p>
    </div>
  );
}

export function WaitReasonsPanel({ signal }: { signal: FuturesSignal }) {
  const reasons = signal.noTradeReasons.length > 0
    ? signal.noTradeReasons
    : signal.primaryNoTradeReason
      ? [signal.primaryNoTradeReason]
      : ['No clean actionable setup is available right now.'];

  return (
    <div className="rounded-xl border border-accent-primary/25 bg-accent-primary/5 px-3 py-3">
      <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-accent-primary">
        <Hourglass className="h-3 w-3" />
        WAIT classification — stand aside is valid
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

export function MtfBlock({ signal }: { signal: FuturesSignal }) {
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

export function PositioningBlock({ signal }: { signal: FuturesSignal }) {
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

export function ForecastBlock({ signal }: { signal: FuturesSignal }) {
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
