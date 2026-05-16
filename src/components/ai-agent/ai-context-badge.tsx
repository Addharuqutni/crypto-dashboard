'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';
import { buildContextSummary } from '@/lib/ai/ai-prompt-builder';
import type { TechnicalContext } from '@/types/ai';
import { Database, ChevronDown, ChevronUp } from 'lucide-react';

interface AiContextBadgeProps {
  context: TechnicalContext | null;
}

/**
 * Badge showing what technical data is attached to the AI context.
 * Expandable to show full detail of all indicators being sent.
 */
export function AiContextBadge({ context }: AiContextBadgeProps) {
  const [expanded, setExpanded] = useState(false);

  if (!context) {
    return (
      <div className="flex items-center gap-1.5 rounded-lg bg-bg-surface-soft px-2.5 py-1.5 text-[10px] text-text-muted">
        <Database className="h-3 w-3" />
        <span>No technical data available</span>
      </div>
    );
  }

  const summary = buildContextSummary(context);

  return (
    <div className="rounded-lg border border-border-subtle/50 bg-bg-surface-soft">
      {/* Collapsed summary */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-1.5 px-2.5 py-1.5 text-left transition-colors hover:bg-bg-surface-raised/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring rounded-lg"
        aria-expanded={expanded}
        aria-label="Toggle AI context details"
      >
        <Database className="h-3 w-3 shrink-0 text-accent-secondary" />
        <span className="flex-1 truncate text-[10px] font-medium text-text-muted">
          {summary}
        </span>
        {expanded ? (
          <ChevronUp className="h-3 w-3 shrink-0 text-text-muted" />
        ) : (
          <ChevronDown className="h-3 w-3 shrink-0 text-text-muted" />
        )}
      </button>

      {/* Expanded detail */}
      {expanded && (
        <div className="border-t border-border-subtle/30 px-2.5 py-2 space-y-1.5 animate-fade-in">
          <p className="text-[9px] font-semibold uppercase tracking-wider text-text-muted">
            Data attached to AI context
          </p>

          <div className="grid grid-cols-2 gap-x-3 gap-y-1">
            <ContextRow label="Symbol" value={context.symbol} />
            <ContextRow label="Timeframe" value={context.timeframe} />

            {context.price != null && (
              <ContextRow label="Price" value={`$${context.price.toLocaleString()}`} />
            )}

            {context.trend && (
              <ContextRow
                label="Trend"
                value={context.trend.value}
                color={
                  context.trend.value === 'bullish'
                    ? 'text-market-up'
                    : context.trend.value === 'bearish'
                      ? 'text-market-down'
                      : 'text-accent-warm'
                }
              />
            )}

            {context.rsi && (
              <ContextRow
                label="RSI"
                value={`${context.rsi.value.toFixed(1)} (${context.rsi.status})`}
                color={
                  context.rsi.status === 'overbought'
                    ? 'text-market-down'
                    : context.rsi.status === 'oversold'
                      ? 'text-market-up'
                      : undefined
                }
              />
            )}

            {context.macd && (
              <ContextRow
                label="MACD"
                value={context.macd.histogram > 0 ? 'Bullish' : 'Bearish'}
                color={context.macd.histogram > 0 ? 'text-market-up' : 'text-market-down'}
              />
            )}

            {context.supportResistance?.support != null && (
              <ContextRow label="Support" value={`$${context.supportResistance.support.toLocaleString()}`} />
            )}

            {context.supportResistance?.resistance != null && (
              <ContextRow label="Resistance" value={`$${context.supportResistance.resistance.toLocaleString()}`} />
            )}

            {context.fibonacci && (
              <ContextRow label="Fib Direction" value={context.fibonacci.direction} />
            )}

            {context.orderBlocks && context.orderBlocks.length > 0 && (
              <ContextRow label="Order Blocks" value={`${context.orderBlocks.length} detected`} />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function ContextRow({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[10px] text-text-muted">{label}</span>
      <span className={cn('text-[10px] font-medium', color ?? 'text-text-secondary')}>
        {value}
      </span>
    </div>
  );
}
