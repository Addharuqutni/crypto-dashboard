'use client';

import { useQuery } from '@tanstack/react-query';
import { fetchFearGreedIndex } from '@/lib/adapters/api/fear-greed';
import { formatRelativeTime } from '@/lib/shared/formatting';
import { cn } from '@/lib/shared/utils';
import type { FearGreedLabel } from '@/types/fear-greed';

/**
 * Fear & Greed Index widget — displays current market sentiment.
 * Shows value (0-100), label, gauge visualization, and last updated time.
 * Handles loading, error, and stale states gracefully.
 */
export function FearGreedWidget() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['fear-greed-index'],
    queryFn: fetchFearGreedIndex,
    staleTime: 60 * 60 * 1000, // 1 hour
    refetchInterval: 60 * 60 * 1000, // Refresh every hour
    retry: 2,
  });

  // Loading state
  if (isLoading) {
    return (
      <div className="card px-5 py-5">
        <div className="skeleton h-3 w-28" />
        <div className="skeleton mt-4 h-10 w-16" />
        <div className="skeleton mt-3 h-2 w-full" />
      </div>
    );
  }

  // Error state
  if (isError || !data) {
    return (
      <div className="card px-5 py-5">
        <p className="text-sm font-medium text-text-secondary">Fear & Greed Index</p>
        <p className="mt-3 text-sm text-text-secondary">Sentiment data unavailable</p>
        <p className="mt-1.5 text-sm text-text-muted">Dashboard continues to function normally.</p>
      </div>
    );
  }

  const { value, label, timestamp } = data;

  return (
    <div className="card px-5 py-5">
      {/* Header */}
      <p className="text-sm font-medium text-text-secondary">Fear & Greed Index</p>

      {/* Value + Label */}
      <div className="mt-3 flex items-end gap-3">
        <span className={cn('numeric text-4xl font-semibold tracking-tight', getLabelColor(label))}>
          {value}
        </span>
        <span className={cn('mb-1 text-sm font-semibold', getLabelColor(label))}>{label}</span>
      </div>

      {/* Gauge Bar */}
      <div className="mt-3">
        <div className="relative h-2 w-full overflow-hidden rounded-full bg-bg-surface-raised">
          {/* Gradient background */}
          <div
            className="absolute inset-0 rounded-full"
            style={{
              background: 'linear-gradient(to right, #ef4444, #f59e0b, #22c55e)',
            }}
          />
          {/* Indicator */}
          <div
            className="absolute top-0 h-full w-1 rounded-full bg-text-primary shadow-sm transition-all duration-500"
            style={{ left: `${value}%` }}
            aria-hidden="true"
          />
        </div>
        {/* Scale labels */}
        <div className="mt-1 flex justify-between text-[10px] text-text-muted">
          <span>Extreme Fear</span>
          <span>Neutral</span>
          <span>Extreme Greed</span>
        </div>
      </div>

      {/* Last Updated */}
      <p className="mt-3 text-xs text-text-muted">Updated {formatRelativeTime(timestamp)}</p>

      {/* Accessible description */}
      <p className="sr-only">
        The crypto Fear and Greed Index is currently at {value} out of 100, indicating {label}. This
        index measures market sentiment based on volatility, momentum, social media, and other
        factors.
      </p>
    </div>
  );
}

/**
 * Get Tailwind color class based on Fear & Greed label.
 */
function getLabelColor(label: FearGreedLabel): string {
  switch (label) {
    case 'Extreme Fear':
      return 'text-market-down';
    case 'Fear':
      return 'text-fear';
    case 'Neutral':
      return 'text-accent-warm';
    case 'Greed':
      return 'text-greed';
    case 'Extreme Greed':
      return 'text-market-up';
  }
}
