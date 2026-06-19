import * as React from 'react';
import { cn } from '@/lib/shared/utils';
import { TrendingUp, TrendingDown, Pause } from 'lucide-react';

export function ActionBadge({ action, showIcon = false }: { action: 'LONG' | 'SHORT' | 'WAIT' | string; showIcon?: boolean }) {
  const tones: Record<string, string> = {
    LONG: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20',
    SHORT: 'bg-rose-500/10 text-rose-500 border-rose-500/20',
    WAIT: 'bg-bg-surface-raised text-text-secondary border-border-subtle',
  };
  
  const icons: Record<string, React.ReactNode> = {
    LONG: <TrendingUp className="h-3 w-3" />,
    SHORT: <TrendingDown className="h-3 w-3" />,
    WAIT: <Pause className="h-3 w-3" />
  };

  return (
    <span className={cn('inline-flex items-center gap-1 justify-center rounded-md border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider', tones[action] || tones.WAIT)}>
      {showIcon && icons[action]}
      {action}
    </span>
  );
}

export function GradeBadge({ grade }: { grade: string }) {
  const tones: Record<string, string> = {
    A: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20',
    B: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
    C: 'bg-amber-500/10 text-amber-500 border-amber-500/20',
    D: 'bg-red-500/10 text-red-500 border-red-500/20',
    F: 'bg-bg-surface-raised text-text-muted border-border-subtle',
  };
  const defaultTone = 'bg-bg-surface-raised text-text-muted border-border-subtle';
  return (
    <span className={cn('inline-flex items-center justify-center rounded-md border px-1.5 py-0.5 font-[family-name:var(--font-display)] text-[11px] font-black leading-none', tones[grade] || defaultTone)}>
      {grade}
    </span>
  );
}

export function SourceBadge({ source }: { source: 'manual' | 'paper' }) {
  const isPaper = source === 'paper';
  return (
    <span
      className={cn(
        'inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider',
        isPaper ? 'border-amber-500/20 bg-amber-500/10 text-amber-500' : 'border-indigo-500/20 bg-indigo-500/10 text-indigo-400'
      )}
    >
      {source}
    </span>
  );
}
