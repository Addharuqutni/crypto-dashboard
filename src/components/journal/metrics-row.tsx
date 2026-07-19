'use client';

import { cn } from '@/lib/shared/utils';
import { BookOpen } from 'lucide-react';
import type { SignalJournalMetrics } from '@/types/signal-journal';
import { formatR } from './filter-and-sort';

export function MetricsRow({ metrics: m }: { metrics: SignalJournalMetrics }) {
  const closed = m.closed > 0;
  const winRateLabel = closed ? `${m.winRate.toFixed(1)}%` : '—';
  const winTone = closed ? (m.winRate >= 50 ? 'bullish' : 'bearish') : 'neutral';
  const rTone = closed
    ? m.closedR > 0
      ? 'bullish'
      : m.closedR < 0
        ? 'bearish'
        : 'neutral'
    : 'neutral';

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <HeroMetric
          label="Win Rate"
          primary={winRateLabel}
          tone={winTone}
          progressPct={closed ? Math.min(100, m.winRate) : 0}
          subtitle={
            closed
              ? `${Math.round((m.winRate / 100) * m.closed)} of ${m.closed} closed`
              : 'No closed trades yet'
          }
        />
        <HeroMetric
          label="Total R"
          primary={closed ? formatR(m.closedR) : '—'}
          tone={rTone}
          subtitle={
            closed
              ? `Avg ${formatR(m.averageR)}R · Best ${formatR(m.bestR)}R · Worst ${formatR(m.worstR)}R`
              : 'Closed R is computed from finalR'
          }
        />
        <HeroMetric
          label="Trades"
          primary={m.total.toString()}
          tone="neutral"
          subtitle={`${m.pending} open · ${m.closed} closed${m.pending > 0 ? ` · Open R ${formatR(m.openR)}` : ''}`}
        />
      </div>

      <dl className="flex flex-wrap items-stretch divide-x divide-border-subtle/40 overflow-hidden rounded-md border border-border-subtle/50 bg-bg-surface-soft">
        <DistroItem
          label="Long"
          value={m.longCount.toString()}
          accent={m.longCount > 0 ? `${m.longWinRate.toFixed(0)}% win` : 'no trades'}
          tone="bullish"
        />
        <DistroItem
          label="Short"
          value={m.shortCount.toString()}
          accent={m.shortCount > 0 ? `${m.shortWinRate.toFixed(0)}% win` : 'no trades'}
          tone="bearish"
        />
        <DistroItem
          label="Manual"
          value={m.manualCount.toString()}
          accent="manual entries"
          tone="neutral"
        />
        <DistroItem
          label="Paper"
          value={m.paperCount.toString()}
          accent="paper trades"
          tone="neutral"
        />
        <DistroItem
          label="Avg Conf"
          value={m.total > 0 ? m.averageConfidence.toFixed(0) : '—'}
          accent="signal score"
          tone="neutral"
        />
      </dl>
    </div>
  );
}

function HeroMetric({
  label,
  primary,
  subtitle,
  tone,
  progressPct,
}: {
  label: string;
  primary: string;
  subtitle?: string;
  tone: 'bullish' | 'bearish' | 'neutral';
  progressPct?: number;
}) {
  return (
    <div className="relative overflow-hidden rounded-lg border border-border-subtle/70 bg-bg-surface-soft px-3.5 py-3">
      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-text-muted">
        {label}
      </p>
      <p
        className={cn(
          'numeric mt-1.5 text-2xl font-bold leading-none tracking-tight',
          tone === 'bullish' && 'text-market-up',
          tone === 'bearish' && 'text-market-down',
          tone === 'neutral' && 'text-text-primary'
        )}
      >
        {primary}
      </p>
      {progressPct != null && progressPct > 0 && (
        <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-bg-surface-raised/70">
          <div
            className={cn(
              'h-full rounded-full transition-[width] duration-500 ease-out',
              tone === 'bullish' && 'bg-market-up',
              tone === 'bearish' && 'bg-market-down',
              tone === 'neutral' && 'bg-text-secondary/60'
            )}
            style={{ width: `${progressPct}%` }}
          />
        </div>
      )}
      {subtitle && (
        <p className="mt-2 truncate text-[10px] text-text-muted" title={subtitle}>
          {subtitle}
        </p>
      )}
    </div>
  );
}

function DistroItem({
  label,
  value,
  accent,
  tone,
}: {
  label: string;
  value: string;
  accent: string;
  tone: 'bullish' | 'bearish' | 'neutral';
}) {
  return (
    <div className="min-w-[96px] flex-1 px-3 py-2">
      <dt className="text-[9px] font-semibold uppercase tracking-[0.14em] text-text-muted">
        {label}
      </dt>
      <dd className="mt-0.5 flex items-baseline gap-1.5">
        <span
          className={cn(
            'numeric text-sm font-bold leading-none',
            tone === 'bullish' && 'text-market-up',
            tone === 'bearish' && 'text-market-down',
            tone === 'neutral' && 'text-text-primary'
          )}
        >
          {value}
        </span>
        <span className="truncate text-[10px] text-text-muted">{accent}</span>
      </dd>
    </div>
  );
}

export function SegmentedControl<T extends string>({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: T;
  onChange: (v: T) => void;
  options: Array<{ value: T; label: string }>;
}) {
  return (
    <div
      className="flex items-center gap-1 rounded-md border border-border-subtle bg-bg-surface-raised p-0.5"
      role="group"
      aria-label={label}
    >
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          aria-pressed={value === o.value}
          className={cn(
            'pressable inline-flex h-7 items-center rounded-sm px-2 text-[10px] font-semibold uppercase tracking-wider transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring',
            value === o.value
              ? 'bg-accent-primary/15 text-accent-primary'
              : 'text-text-muted hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring'
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function EmptyState() {
  return (
    <div className="rounded-lg border border-border-subtle bg-bg-surface-soft px-4 py-8 text-center">
      <BookOpen className="mx-auto h-6 w-6 text-text-muted" />
      <p className="mt-2 text-sm font-medium text-text-secondary">No saved signals yet.</p>
      <p className="mt-1 text-xs text-text-muted">
        Save a setup from the Futures Signal panel, or run a paper trade from the journal workflow.
      </p>
    </div>
  );
}
