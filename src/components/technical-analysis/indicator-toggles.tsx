'use client';

import { cn } from '@/lib/shared/utils';

const INDICATORS = ['MA7', 'MA25', 'MA99', 'RSI', 'MACD', 'Volume', 'S/R', 'Fib', 'OB'] as const;

interface IndicatorTogglesProps {
  active: Set<string>;
  onToggle: (key: string) => void;
}

/**
 * Indicator toggle group — allows user to enable/disable technical indicators.
 * Includes Order Block (OB) and Fibonacci (Fib) indicators.
 * Keyboard accessible with clear active/inactive states.
 */
export function IndicatorToggles({ active, onToggle }: IndicatorTogglesProps) {
  return (
    <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Technical indicator toggles">
      {INDICATORS.map((key) => {
        const isActive = active.has(key);
        return (
          <button
            key={key}
            onClick={() => onToggle(key)}
            className={cn(
              'rounded-md px-2.5 py-1.5 text-xs font-semibold transition-all duration-150',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring',
              isActive
                ? 'bg-accent-primary/15 text-accent-primary shadow-sm shadow-accent-primary/10'
                : 'bg-bg-surface-raised text-text-muted hover:bg-bg-surface-soft hover:text-text-secondary'
            )}
            aria-pressed={isActive}
            aria-label={`${isActive ? 'Disable' : 'Enable'} ${getIndicatorLabel(key)} indicator`}
          >
            {key}
          </button>
        );
      })}
    </div>
  );
}

/** Get full label for accessibility */
function getIndicatorLabel(key: string): string {
  const labels: Record<string, string> = {
    MA7: 'Moving Average 7',
    MA25: 'Moving Average 25',
    MA99: 'Moving Average 99',
    RSI: 'Relative Strength Index',
    MACD: 'MACD',
    Volume: 'Volume',
    'S/R': 'Support and Resistance',
    Fib: 'Fibonacci Retracement',
    OB: 'Order Block',
  };
  return labels[key] ?? key;
}
