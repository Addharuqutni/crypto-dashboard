'use client';

import { memo, useState } from 'react';
import { cn } from '@/lib/shared/utils';
import { formatCurrency } from '@/lib/shared/formatting';
import { computeJournalPnl } from '@/lib/application/journal/pnl';
import { Pencil, Trash2, X } from 'lucide-react';
import type { SignalJournalEntry } from '@/types/signal-journal';
import { formatR } from './filter-and-sort';
import { ActionBadge, SourceBadge, StatusPill, SimpleLevel, ExpiryCountdown } from './badges';
import { ManualClosePopover } from './manual-close-popover';

/**
 * Individual signal journal card.
 */
export const JournalCard = memo(function JournalCard({
  entry,
  livePrice,
  onRemove,
  onCancel,
  onMarkOutcome,
}: {
  entry: SignalJournalEntry;
  livePrice: number | undefined;
  onRemove: (id: string) => void;
  onCancel: (id: string) => void;
  onMarkOutcome: (
    id: string,
    status: 'TP1' | 'TP2' | 'TP3' | 'SL' | 'EXPIRED',
    actualExit?: number
  ) => void;
}) {
  const [overrideOpen, setOverrideOpen] = useState(false);
  const pnl = computeJournalPnl(entry, livePrice);

  const liveDeltaPct =
    livePrice != null && entry.entryPrice != null && entry.entryPrice > 0
      ? ((livePrice - entry.entryPrice) / entry.entryPrice) * 100
      : null;
  const liveFavorable =
    liveDeltaPct == null
      ? null
      : entry.action === 'LONG'
        ? liveDeltaPct >= 0
        : entry.action === 'SHORT'
          ? liveDeltaPct <= 0
          : null;

  const activeTp = entry.tp3 ?? entry.tp2 ?? entry.tp1 ?? null;
  const activeTpLabel = entry.tp3 != null ? 'TP3' : entry.tp2 != null ? 'TP2' : 'TP1';

  return (
    <article
      className={cn(
        'flex flex-col rounded-lg border bg-bg-surface-soft transition-colors hover:border-border-strong',
        entry.status === 'SL' && 'border-market-down/30',
        (entry.status === 'TP1' || entry.status === 'TP2' || entry.status === 'TP3') &&
          'border-market-up/30',
        entry.status === 'PENDING' && 'border-border-subtle/70',
        entry.status === 'CANCELLED' && 'border-border-subtle/40 opacity-60',
        entry.status === 'EXPIRED' && 'border-border-subtle/40'
      )}
    >
      {/* ─── Section 1: Identity ─── */}
      <div className="flex items-center gap-2 px-3 pt-3 pb-2">
        <ActionBadge action={entry.action} />
        <span className="truncate text-sm font-bold text-text-primary">{entry.symbol}</span>
        <span className="text-[10px] font-medium uppercase tracking-wider text-text-muted">
          {entry.timeframe}
        </span>
        {entry.source && entry.source !== 'manual' && <SourceBadge source={entry.source} />}
        <StatusPill status={entry.status} className="ml-auto" />
      </div>

      {/* ─── Section 2: Performance ─── */}
      <div className="flex items-end justify-between gap-2 border-t border-border-subtle/30 px-3 py-2.5">
        <div>
          <p className="text-[9px] font-medium uppercase tracking-wider text-text-muted">
            {pnl.realized ? 'Realized' : 'Unrealized'}
          </p>
          <p
            className={cn(
              'numeric mt-0.5 text-xl font-bold leading-none',
              pnl.percent != null && pnl.percent > 0 && 'text-market-up',
              pnl.percent != null && pnl.percent < 0 && 'text-market-down',
              (pnl.percent == null || pnl.percent === 0) && 'text-text-primary'
            )}
          >
            {pnl.percent != null ? `${pnl.percent > 0 ? '+' : ''}${pnl.percent.toFixed(2)}%` : '—'}
          </p>
        </div>
        <div className="text-right">
          <p className="text-[9px] font-medium uppercase tracking-wider text-text-muted">Live</p>
          <p className="numeric mt-0.5 text-sm font-bold text-text-primary">
            {livePrice != null ? formatCurrency(livePrice) : '—'}
          </p>
          {liveDeltaPct != null && liveFavorable != null && (
            <p
              className={cn(
                'numeric text-[10px] font-semibold',
                liveFavorable ? 'text-market-up' : 'text-market-down'
              )}
            >
              {liveDeltaPct > 0 ? '+' : ''}
              {liveDeltaPct.toFixed(2)}%
            </p>
          )}
        </div>
      </div>

      {/* ─── Section 3: Levels ─── */}
      <div className="grid grid-cols-3 gap-px border-t border-border-subtle/30 bg-border-subtle/20">
        <SimpleLevel label="Entry" value={entry.entryPrice} />
        <SimpleLevel label="SL" value={entry.stopLoss} tone="bearish" />
        <SimpleLevel label={activeTpLabel} value={activeTp} tone="bullish" />
      </div>

      {/* ─── Section 4: Quality ─── */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-border-subtle/30 px-3 py-2 text-[10px]">
        <span className="text-text-muted">
          Grade <span className="font-bold text-text-primary">{entry.signalGrade}</span>
        </span>
        <span className="text-text-muted">
          Conf <span className="numeric font-bold text-text-primary">{entry.confidenceScore}</span>
        </span>
        {entry.riskRewardRatio != null && (
          <span className="text-text-muted">
            RR{' '}
            <span className="numeric font-bold text-text-primary">
              {entry.riskRewardRatio.toFixed(1)}
            </span>
          </span>
        )}
        {entry.setupType && (
          <span className="capitalize text-text-muted">
            {entry.setupType.toLowerCase().replace(/_/g, ' ')}
          </span>
        )}
        {entry.finalR != null && Number.isFinite(entry.finalR) && (
          <span
            className={cn(
              'numeric ml-auto font-bold',
              entry.finalR > 0
                ? 'text-market-up'
                : entry.finalR < 0
                  ? 'text-market-down'
                  : 'text-text-muted'
            )}
          >
            {formatR(entry.finalR)}R
          </span>
        )}
      </div>

      {/* ─── Section 5: Tracking (conditional) ─── */}
      {(entry.maxFavorableExcursion != null ||
        entry.maxAdverseExcursion != null ||
        (entry.status === 'PENDING' && entry.expiresAt != null)) && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-border-subtle/30 px-3 py-2 text-[10px] text-text-muted">
          {entry.maxFavorableExcursion != null && (
            <span>
              MFE{' '}
              <span className="numeric font-semibold text-market-up">
                {formatCurrency(entry.maxFavorableExcursion)}
              </span>
            </span>
          )}
          {entry.maxAdverseExcursion != null && (
            <span>
              MAE{' '}
              <span className="numeric font-semibold text-market-down">
                {formatCurrency(entry.maxAdverseExcursion)}
              </span>
            </span>
          )}
          {entry.status === 'PENDING' && entry.expiresAt != null && (
            <ExpiryCountdown expiresAt={entry.expiresAt} />
          )}
        </div>
      )}

      {/* ─── Section 6: Actions ─── */}
      {entry.status === 'PENDING' && (
        <div className="flex items-center justify-end gap-1 border-t border-border-subtle/30 px-3 py-2">
          <button
            onClick={() => setOverrideOpen((v) => !v)}
            className="inline-flex h-9 items-center gap-1 rounded-md border border-border-subtle bg-bg-surface-raised px-2 text-[10px] font-semibold text-text-secondary transition-colors hover:border-accent-primary/40 hover:text-accent-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
            aria-label="Mark outcome manually"
          >
            <Pencil className="h-3 w-3" />
            Close
          </button>
          <button
            onClick={() => onCancel(entry.id)}
            className="tap-target inline-flex h-9 w-9 items-center justify-center rounded-md border border-border-subtle bg-bg-surface-raised text-text-muted transition-colors hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
            aria-label="Cancel signal"
            title="Cancel"
          >
            <X className="h-3 w-3" />
          </button>
          <button
            onClick={() => onRemove(entry.id)}
            className="tap-target inline-flex h-9 w-9 items-center justify-center rounded-md border border-border-subtle bg-bg-surface-raised text-text-muted transition-colors hover:border-market-down/40 hover:text-market-down focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
            aria-label="Remove entry"
            title="Remove"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        </div>
      )}

      {entry.status !== 'PENDING' && (
        <div className="flex items-center justify-end gap-1 border-t border-border-subtle/30 px-3 py-2">
          <button
            onClick={() => onRemove(entry.id)}
            className="tap-target inline-flex h-9 w-9 items-center justify-center rounded-md border border-border-subtle bg-bg-surface-raised text-text-muted transition-colors hover:border-market-down/40 hover:text-market-down focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
            aria-label="Remove entry"
            title="Remove"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        </div>
      )}

      {overrideOpen && entry.status === 'PENDING' && (
        <ManualClosePopover
          entry={entry}
          onCancel={() => setOverrideOpen(false)}
          onSubmit={(status, exit) => {
            onMarkOutcome(entry.id, status, exit);
            setOverrideOpen(false);
          }}
        />
      )}
    </article>
  );
});
