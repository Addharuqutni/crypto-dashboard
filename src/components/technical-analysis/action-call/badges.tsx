'use client';

import { cn } from '@/lib/shared/utils';
import { ActionBadge as SharedActionBadge } from '@/components/ui/badges';
import type { FuturesRiskLevel } from '@/types/signal-core';

export function ActionBadge({
  action,
}: {
  action: Parameters<typeof SharedActionBadge>[0]['action'];
}) {
  return <SharedActionBadge action={action} showIcon variant="default" />;
}

export function RiskPill({ level }: { level: FuturesRiskLevel }) {
  const map: Record<FuturesRiskLevel, { label: string; className: string }> = {
    LOW: { label: 'Low Risk', className: 'border-market-up/30 bg-market-up/5 text-market-up' },
    MEDIUM: {
      label: 'Medium Risk',
      className: 'border-accent-warm/30 bg-accent-warm/5 text-accent-warm',
    },
    HIGH: {
      label: 'High Risk',
      className: 'border-market-down/40 bg-market-down/10 text-market-down',
    },
    NO_TRADE: {
      label: 'No Trade',
      className: 'border-text-muted/30 bg-bg-surface-raised text-text-muted',
    },
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

export function ConfidenceMeter({ score }: { score: number }) {
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
      <span className="text-[10px] font-semibold uppercase tracking-wider text-text-muted">
        Confidence
      </span>
      <div className="h-1.5 w-24 overflow-hidden rounded-full bg-bg-surface-raised">
        <div
          className={cn('h-full rounded-full transition-all', tone)}
          style={{ width: `${clamped}%` }}
        />
      </div>
      <span className="numeric text-xs font-semibold text-text-primary">{clamped}</span>
    </div>
  );
}

export function PlanStat({
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
      <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-text-muted">
        {icon}
        {label}
      </div>
      <p
        className={cn(
          'mt-1 numeric text-sm font-semibold',
          tone === 'bullish'
            ? 'text-market-up'
            : tone === 'bearish'
              ? 'text-market-down'
              : 'text-text-primary'
        )}
      >
        {value}
      </p>
    </div>
  );
}
