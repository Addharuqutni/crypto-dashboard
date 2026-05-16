'use client';

import { useEffect } from 'react';
import { useSignalJournalStore } from '@/stores/use-signal-journal-store';
import { useMarketStore } from '@/stores/use-market-store';
import { cn } from '@/lib/utils';
import { formatCurrency } from '@/lib/formatting';
import { Trash2, BookOpen, X } from 'lucide-react';
import type { SignalJournalEntry, SignalJournalStatus } from '@/types/signal-journal';

/**
 * Signal Journal Panel.
 *
 * Lists saved signals, lets the user mark outcomes manually, and shows
 * basic aggregate metrics. Outcome auto-promotion (TP/SL) is driven by the
 * market store's live prices — not fabricated from indicator math.
 */
export function SignalJournalPanel() {
  const hydrate = useSignalJournalStore((s) => s.hydrate);
  const hydrated = useSignalJournalStore((s) => s.hydrated);
  const entries = useSignalJournalStore((s) => s.entries);
  const remove = useSignalJournalStore((s) => s.remove);
  const updateStatus = useSignalJournalStore((s) => s.updateStatus);
  const updateExcursions = useSignalJournalStore((s) => s.updateExcursions);
  const metrics = useSignalJournalStore((s) => s.metrics);
  const prices = useMarketStore((s) => s.prices);

  // Hydrate once on mount.
  useEffect(() => {
    if (!hydrated) hydrate();
  }, [hydrate, hydrated]);

  // Auto-update excursions for pending entries based on live prices.
  useEffect(() => {
    if (!hydrated) return;
    for (const entry of entries) {
      if (entry.status !== 'PENDING') continue;
      const live = prices[entry.symbol];
      if (live?.price && Number.isFinite(live.price)) {
        updateExcursions(entry.id, live.price);
      }
    }
  }, [entries, prices, hydrated, updateExcursions]);

  const m = metrics();

  return (
    <section className="card space-y-4 px-4 py-4" aria-labelledby="signal-journal-title">
      <header className="flex items-center justify-between">
        <h2
          id="signal-journal-title"
          className="flex items-center gap-2 font-[family-name:var(--font-display)] text-sm font-semibold uppercase tracking-wider text-text-muted"
        >
          <BookOpen className="h-3.5 w-3.5" />
          Signal Journal
        </h2>
        <span className="text-[10px] font-medium uppercase tracking-wider text-text-muted">
          {m.total} tracked
        </span>
      </header>

      {/* Metrics — Outcome Percentages */}
      <div className="space-y-3">
        {/* Primary win/loss row */}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Metric label="Win Rate" value={`${m.winRate.toFixed(1)}%`} tone="bullish" />
          <Metric label="Loss Rate" value={`${m.lossRate.toFixed(1)}%`} tone="bearish" />
          <Metric label="Pending" value={m.pending.toString()} />
          <Metric label="Cancelled" value={`${m.cancelledRate.toFixed(0)}%`} />
        </div>

        {/* Action breakdown + per-side win rates */}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          <Metric label="Total" value={m.total.toString()} />
          <Metric label="LONG" value={`${m.longCount} (${m.longWinRate.toFixed(0)}% win)`} tone="bullish" />
          <Metric label="SHORT" value={`${m.shortCount} (${m.shortWinRate.toFixed(0)}% win)`} tone="bearish" />
          <Metric label="WAIT" value={m.waitCount.toString()} />
          <Metric label="Avg Conf" value={m.averageConfidence.toFixed(0)} />
          <Metric label="A/A+" value={m.bestGradeCount.toString()} />
        </div>
      </div>

      {/* Entries — Card Grid */}
      {entries.length === 0 ? (
        <div className="rounded-lg border border-border-subtle bg-bg-surface-soft px-4 py-6 text-center">
          <p className="text-sm font-medium text-text-secondary">No saved signals yet.</p>
          <p className="mt-1 text-xs text-text-muted">
            Save a setup from the Futures Signal panel to start tracking outcomes.
          </p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {entries.map((entry) => (
            <JournalCard
              key={entry.id}
              entry={entry}
              livePrice={prices[entry.symbol]?.price}
              onRemove={() => remove(entry.id)}
              onCancel={() => updateStatus(entry.id, 'CANCELLED')}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function Metric({ label, value, tone }: { label: string; value: string; tone?: 'bullish' | 'bearish' }) {
  return (
    <div className="rounded-md border border-border-subtle bg-bg-surface-soft px-2 py-1.5">
      <p className="text-[10px] font-medium uppercase tracking-wider text-text-muted">{label}</p>
      <p
        className={cn(
          'numeric mt-0.5 text-sm font-semibold',
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

/**
 * Individual signal journal card.
 *
 * Layout:
 *   ┌─────────────────────────────────────────┐
 *   │ [ACTION] SYMBOL  TF  GRADE  STATUS      │  ← header
 *   │                                         │
 *   │        PnL %  (large, colored)          │  ← hero metric
 *   │                                         │
 *   │  Entry    SL      Live                  │  ← price row
 *   │  TP1 · TP2 · TP3                        │  ← targets row
 *   │                                         │
 *   │  MFE  MAE  Conf                         │  ← footer stats
 *   │                          [Cancel] [Del] │  ← actions
 *   └─────────────────────────────────────────┘
 */
function JournalCard({
  entry,
  livePrice,
  onRemove,
  onCancel,
}: {
  entry: SignalJournalEntry;
  livePrice: number | undefined;
  onRemove: () => void;
  onCancel: () => void;
}) {
  const pnl = computePnl(entry, livePrice);

  return (
    <article
      className={cn(
        'relative flex flex-col gap-3 rounded-xl border bg-bg-surface-soft p-3.5 transition-shadow hover:shadow-md',
        entry.status === 'SL' && 'border-market-down/30',
        (entry.status === 'TP1' || entry.status === 'TP2' || entry.status === 'TP3') && 'border-market-up/30',
        entry.status === 'PENDING' && 'border-border-subtle',
        entry.status === 'CANCELLED' && 'border-border-subtle/50 opacity-60',
        entry.status === 'EXPIRED' && 'border-border-subtle/50 opacity-60'
      )}
    >
      {/* Header: Action + Symbol + Meta */}
      <div className="flex items-center gap-2">
        <span
          className={cn(
            'rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider',
            entry.action === 'LONG' && 'bg-market-up/10 text-market-up',
            entry.action === 'SHORT' && 'bg-market-down/10 text-market-down',
            entry.action === 'WAIT' && 'bg-bg-surface-raised text-text-muted'
          )}
        >
          {entry.action}
        </span>
        <span className="text-sm font-bold text-text-primary">{entry.symbol}</span>
        <span className="text-[10px] uppercase text-text-muted">{entry.timeframe}</span>
        <span className="ml-auto rounded-sm border border-border-subtle bg-bg-surface-raised px-1.5 py-0.5 text-[10px] font-bold text-text-secondary">
          {entry.signalGrade}
        </span>
      </div>

      {/* Hero: PnL + Status */}
      <div className="flex items-center justify-between">
        <div className="flex items-baseline gap-2">
          {pnl != null ? (
            <span
              className={cn(
                'numeric text-xl font-bold',
                pnl > 0 && 'text-market-up',
                pnl < 0 && 'text-market-down',
                pnl === 0 && 'text-text-muted'
              )}
            >
              {pnl > 0 ? '+' : ''}{pnl.toFixed(2)}%
            </span>
          ) : (
            <span className="text-xl font-bold text-text-muted">—</span>
          )}
          <span className="text-[10px] text-text-muted">PnL</span>
        </div>
        <StatusPill status={entry.status} />
      </div>

      {/* Price Grid */}
      <div className="grid grid-cols-3 gap-2 rounded-lg border border-border-subtle/50 bg-bg-surface-raised/40 px-2.5 py-2">
        <PriceCell label="Entry" value={entry.entryPrice} />
        <PriceCell label="SL" value={entry.stopLoss} tone="bearish" />
        <PriceCell label="Live" value={livePrice ?? null} />
      </div>

      {/* Take Profits */}
      {entry.tp1 != null && (
        <div className="flex items-center gap-1.5 text-[10px]">
          <span className="font-medium uppercase tracking-wider text-text-muted">TP</span>
          <span className="numeric font-medium text-market-up">{formatCurrency(entry.tp1)}</span>
          <span className="text-text-muted">·</span>
          <span className="numeric font-medium text-market-up">{formatCurrency(entry.tp2 ?? 0)}</span>
          <span className="text-text-muted">·</span>
          <span className="numeric font-medium text-market-up">{formatCurrency(entry.tp3 ?? 0)}</span>
        </div>
      )}

      {/* Footer: Excursions + Confidence + Actions */}
      <div className="flex items-end justify-between border-t border-border-subtle/50 pt-2.5">
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-text-muted">
          {entry.maxFavorableExcursion != null && (
            <span>
              MFE <span className="numeric font-medium text-market-up">{formatCurrency(entry.maxFavorableExcursion)}</span>
            </span>
          )}
          {entry.maxAdverseExcursion != null && (
            <span>
              MAE <span className="numeric font-medium text-market-down">{formatCurrency(entry.maxAdverseExcursion)}</span>
            </span>
          )}
          <span>Conf <span className="font-medium text-text-secondary">{entry.confidenceScore}</span></span>
        </div>

        <div className="flex items-center gap-1">
          {entry.status === 'PENDING' && (
            <button
              onClick={onCancel}
              className="inline-flex items-center gap-1 rounded-md border border-border-subtle bg-bg-surface-raised px-2 py-0.5 text-[10px] font-medium text-text-muted transition-colors hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
              aria-label="Cancel signal"
            >
              <X className="h-3 w-3" />
            </button>
          )}
          <button
            onClick={onRemove}
            className="inline-flex h-5 w-5 items-center justify-center rounded-md border border-border-subtle bg-bg-surface-raised text-text-muted transition-colors hover:text-market-down focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
            aria-label="Remove journal entry"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        </div>
      </div>
    </article>
  );
}

/**
 * Compute unrealised PnL percentage for a journal entry.
 *
 * - For PENDING entries: uses live price vs entry price.
 * - For closed entries (TP/SL): uses the TP/SL level vs entry price
 *   as a "realised" approximation (actual fill may differ slightly).
 * - Returns null when entry price is missing or action is WAIT.
 */
function computePnl(entry: SignalJournalEntry, livePrice: number | undefined): number | null {
  if (entry.entryPrice == null || entry.entryPrice <= 0) return null;
  if (entry.action === 'WAIT') return null;

  const isLong = entry.action === 'LONG';

  // For closed trades, approximate PnL from the level that was hit.
  if (entry.status === 'SL' && entry.stopLoss != null) {
    return isLong
      ? ((entry.stopLoss - entry.entryPrice) / entry.entryPrice) * 100
      : ((entry.entryPrice - entry.stopLoss) / entry.entryPrice) * 100;
  }
  if (entry.status === 'TP1' && entry.tp1 != null) {
    return isLong
      ? ((entry.tp1 - entry.entryPrice) / entry.entryPrice) * 100
      : ((entry.entryPrice - entry.tp1) / entry.entryPrice) * 100;
  }
  if (entry.status === 'TP2' && entry.tp2 != null) {
    return isLong
      ? ((entry.tp2 - entry.entryPrice) / entry.entryPrice) * 100
      : ((entry.entryPrice - entry.tp2) / entry.entryPrice) * 100;
  }
  if (entry.status === 'TP3' && entry.tp3 != null) {
    return isLong
      ? ((entry.tp3 - entry.entryPrice) / entry.entryPrice) * 100
      : ((entry.entryPrice - entry.tp3) / entry.entryPrice) * 100;
  }

  // For pending entries, use live price.
  if (entry.status === 'PENDING' && livePrice != null && livePrice > 0) {
    return isLong
      ? ((livePrice - entry.entryPrice) / entry.entryPrice) * 100
      : ((entry.entryPrice - livePrice) / entry.entryPrice) * 100;
  }

  return null;
}

/** Small price cell used inside the card's price grid. */
function PriceCell({ label, value, tone }: { label: string; value: number | null; tone?: 'bullish' | 'bearish' }) {
  return (
    <div>
      <p className="text-[9px] font-medium uppercase tracking-wider text-text-muted">{label}</p>
      <p
        className={cn(
          'numeric mt-0.5 text-xs font-semibold',
          tone === 'bullish' && 'text-market-up',
          tone === 'bearish' && 'text-market-down',
          !tone && 'text-text-primary'
        )}
      >
        {value != null ? formatCurrency(value) : '—'}
      </p>
    </div>
  );
}

function StatusPill({ status }: { status: SignalJournalStatus }) {
  const map: Record<SignalJournalStatus, { label: string; className: string }> = {
    PENDING: { label: 'Pending', className: 'border-accent-primary/30 bg-accent-primary/10 text-accent-primary' },
    TP1: { label: 'TP1', className: 'border-market-up/30 bg-market-up/5 text-market-up' },
    TP2: { label: 'TP2', className: 'border-market-up/40 bg-market-up/10 text-market-up' },
    TP3: { label: 'TP3', className: 'border-market-up/50 bg-market-up/15 text-market-up' },
    SL: { label: 'SL Hit', className: 'border-market-down/40 bg-market-down/10 text-market-down' },
    EXPIRED: { label: 'Expired', className: 'border-text-muted/30 bg-bg-surface-raised text-text-muted' },
    CANCELLED: { label: 'Cancelled', className: 'border-text-muted/20 bg-bg-surface-raised text-text-muted' },
  };
  const c = map[status];
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider',
        c.className
      )}
    >
      {c.label}
    </span>
  );
}
