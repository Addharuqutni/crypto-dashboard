import * as React from 'react';
import { cn } from '@/lib/shared/utils';
import { TrendingUp, TrendingDown, Hourglass } from 'lucide-react';

export function ActionBadge({
  action,
  showIcon = false,
  variant = 'compact',
}: {
  action: 'LONG' | 'SHORT' | 'WAIT' | string;
  showIcon?: boolean;
  variant?: 'compact' | 'default';
}) {
  const tones: Record<string, string> = {
    LONG: 'bg-market-up/10 text-market-up border-market-up/30',
    SHORT: 'bg-market-down/10 text-market-down border-market-down/30',
    WAIT: 'bg-accent-warm/10 text-accent-warm border-accent-warm/30',
  };

  const icons: Record<string, React.ReactNode> = {
    LONG: <TrendingUp className={variant === 'default' ? 'h-4 w-4' : 'h-3 w-3'} />,
    SHORT: <TrendingDown className={variant === 'default' ? 'h-4 w-4' : 'h-3 w-3'} />,
    WAIT: <Hourglass className={variant === 'default' ? 'h-4 w-4' : 'h-3 w-3'} />,
  };

  const sizeClass =
    variant === 'default'
      ? 'gap-1.5 px-2.5 py-1 text-xs'
      : 'gap-0.5 px-2 py-0.5 text-[10px]';

  return (
    <span
      className={cn(
        'inline-flex items-center justify-center rounded-md border font-bold uppercase tracking-wider',
        sizeClass,
        tones[action] || tones.WAIT
      )}
      aria-label={`Setup classification ${action}`}
    >
      {showIcon && icons[action]}
      {action}
    </span>
  );
}

export function GradeBadge({ grade, showPrefix = false }: { grade: string; showPrefix?: boolean }) {
  const tones: Record<string, string> = {
    'A+': 'bg-market-up/10 text-market-up border-market-up/40',
    A: 'bg-market-up/5 text-market-up border-market-up/30',
    B: 'bg-accent-primary/10 text-accent-primary border-accent-primary/30',
    C: 'bg-accent-warm/10 text-accent-warm border-accent-warm/30',
    D: 'bg-bg-surface-raised text-text-muted border-border-subtle',
    F: 'bg-bg-surface-raised text-text-muted border-border-subtle',
  };
  const defaultTone = 'bg-bg-surface-raised text-text-muted border-border-subtle';
  return (
    <span
      className={cn(
        'inline-flex items-center justify-center rounded-md border px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider',
        tones[grade] || defaultTone
      )}
      aria-label={`Setup grade ${grade}`}
    >
      {showPrefix ? `Grade ${grade}` : grade}
    </span>
  );
}
