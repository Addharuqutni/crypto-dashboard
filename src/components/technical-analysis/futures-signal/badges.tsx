'use client';

import { cn } from '@/lib/shared/utils';
import { ActionBadge as SharedActionBadge, GradeBadge as SharedGradeBadge } from '@/components/shared/badges';
import type {
  FuturesEntryTrigger,
  FuturesRiskLevel,
} from '@/types/futures-signal';
import { Zap } from 'lucide-react';

export function ActionBadge({ action }: { action: Parameters<typeof SharedActionBadge>[0]['action'] }) {
  return <SharedActionBadge action={action} showIcon variant="default" />;
}

export function GradeBadge({ grade }: { grade: string }) {
  return <SharedGradeBadge grade={grade} showPrefix />;
}

export function RiskPill({ level }: { level: FuturesRiskLevel }) {
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

export function TriggerPill({ trigger }: { trigger: FuturesEntryTrigger }) {
  if (trigger === 'NO_TRIGGER') return null;
  const label = trigger.toLowerCase().replace(/_/g, ' ');
  return (
    <span className="inline-flex items-center gap-1 rounded-md border border-accent-secondary/30 bg-accent-secondary/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-accent-secondary">
      <Zap className="h-3 w-3" />
      {label}
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
      <span className="text-[10px] font-semibold uppercase tracking-wider text-text-muted">Confidence</span>
      <div className="h-1.5 w-24 overflow-hidden rounded-full bg-bg-surface-raised">
        <div className={cn('h-full rounded-full transition-all', tone)} style={{ width: `${clamped}%` }} />
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

export function Row({
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
