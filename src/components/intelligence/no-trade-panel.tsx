'use client';

import { Hourglass, AlertTriangle, Eye } from 'lucide-react';
import type { NoTradeExplanation } from '@/types/intelligence';
import { cn } from '@/lib/utils';

/**
 * No-Trade Intelligence panel.
 *
 * Renders the deterministic `NoTradeExplanation`. The category drives the
 * accent color so the user can scan for "data" vs "structure" vs "volatility"
 * issues at a glance.
 */
export interface NoTradePanelProps {
  explanation: NoTradeExplanation | null;
}

export function NoTradePanel({ explanation }: NoTradePanelProps) {
  if (!explanation) return null;

  const tone = categoryTone(explanation.category);

  return (
    <section
      className={cn(
        'card space-y-3 px-4 py-4 border-l-4',
        tone === 'data' && 'border-l-blue-500/60',
        tone === 'structure' && 'border-l-yellow-500/60',
        tone === 'volatility' && 'border-l-orange-500/60',
        tone === 'risk_reward' && 'border-l-red-500/50',
        tone === 'permission' && 'border-l-purple-500/50',
        tone === 'unknown' && 'border-l-text-muted/30'
      )}
      aria-labelledby="no-trade-title"
    >
      <header className="flex items-center justify-between">
        <h2
          id="no-trade-title"
          className="flex items-center gap-2 font-[family-name:var(--font-display)] text-sm font-semibold uppercase tracking-wider text-text-muted"
        >
          <Hourglass className="h-3.5 w-3.5" />
          Why no trade
        </h2>
        <span className="rounded-sm border border-border-subtle bg-bg-surface-soft px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-text-muted">
          {explanation.category.replace(/_/g, ' ')}
        </span>
      </header>

      <div>
        <h3 className="text-sm font-semibold text-text-primary">{explanation.headline}</h3>
        <p className="mt-1 text-[12px] leading-relaxed text-text-secondary">{explanation.detail}</p>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <Card label="Condition that must change" tone="caution" icon={<AlertTriangle className="h-3 w-3" />}>
          {explanation.conditionToChange}
        </Card>
        <Card label="Re-evaluate in" tone="neutral" icon={<Hourglass className="h-3 w-3" />}>
          ~{explanation.reevaluateInMinutes} min
        </Card>
      </div>

      {explanation.levelToWatch && (
        <Card label="Level to watch" tone="bullish" icon={<Eye className="h-3 w-3" />}>
          {explanation.levelToWatch}
        </Card>
      )}
    </section>
  );
}

function categoryTone(c: NoTradeExplanation['category']): NoTradeExplanation['category'] {
  return c;
}

function Card({
  label,
  tone,
  icon,
  children,
}: {
  label: string;
  tone: 'caution' | 'neutral' | 'bullish';
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border-subtle bg-bg-surface-soft px-3 py-2.5">
      <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-text-muted">
        {icon}
        {label}
      </p>
      <p
        className={cn(
          'mt-1 text-[12px] leading-relaxed',
          tone === 'caution' && 'text-yellow-300',
          tone === 'bullish' && 'text-text-primary',
          tone === 'neutral' && 'text-text-secondary'
        )}
      >
        {children}
      </p>
    </div>
  );
}
