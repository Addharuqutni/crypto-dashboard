'use client';

import { useEffect, useMemo } from 'react';
import { Activity, AlertTriangle } from 'lucide-react';
import { useSignalJournalStore } from '@/stores/use-signal-journal-store';
import { useMarketStore } from '@/stores/use-market-store';
import { usePaperTradingStore } from '@/stores/use-paper-trading-store';
import { cn } from '@/lib/shared/utils';
import { formatCurrency } from '@/lib/shared/formatting';
import type { SignalJournalEntry } from '@/types/signal-journal';

/**
 * Paper-trading status panel.
 *
 * Reads the journal store filtered by `source: 'paper'`, runs `applyMarketTick`
 * on every observed price, and shows aggregated stats + the most recent entries.
 * Outcomes auto-promote when SL/TP are touched and auto-expire after the
 * configured max-hold deadline. Nothing is fabricated.
 */
export function PaperTradingPanel() {
  const hydrate = useSignalJournalStore((s) => s.hydrate);
  const hydrated = useSignalJournalStore((s) => s.hydrated);
  const entries = useSignalJournalStore((s) => s.entries);
  const prices = useMarketStore((s) => s.prices);
  const applyMarketTick = usePaperTradingStore((s) => s.applyMarketTick);
  const stats = usePaperTradingStore((s) => s.stats);

  useEffect(() => {
    if (!hydrated) hydrate();
  }, [hydrate, hydrated]);

  // Forward live prices into the paper-trading store so excursions and
  // outcomes update without UI bookkeeping. This intentionally only covers
  // symbols that already have a price subscription elsewhere in the app.
  useEffect(() => {
    if (!hydrated) return;
    const seen = new Set<string>();
    for (const entry of entries) {
      if (entry.source !== 'paper' || entry.status !== 'PENDING') continue;
      if (seen.has(entry.symbol)) continue;
      seen.add(entry.symbol);
      const live = prices[entry.symbol];
      if (live?.price && Number.isFinite(live.price)) {
        applyMarketTick(entry.symbol, live.price);
      }
    }
  }, [entries, prices, hydrated, applyMarketTick]);

  const paperEntries = useMemo(
    () => entries.filter((e) => e.source === 'paper').slice(0, 12),
    [entries]
  );

  const s = stats();

  return (
    <section className="card space-y-4 px-4 py-4" aria-labelledby="paper-trading-title">
      <header className="flex items-center justify-between">
        <h2
          id="paper-trading-title"
          className="flex items-center gap-2 font-[family-name:var(--font-display)] text-sm font-semibold uppercase tracking-wider text-text-muted"
        >
          <Activity className="h-3.5 w-3.5" />
          Paper Trading
        </h2>
        <span className="text-[10px] font-medium uppercase tracking-wider text-text-muted">
          {s.total} tracked
        </span>
      </header>

      <p className="text-xs text-text-muted">
        Submit a signal from the Futures panel to start tracking it here. Outcomes are derived from
        live Binance Futures prices &mdash; never fabricated. Trades auto-expire after the
        configured max-hold deadline.
      </p>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <Metric label="Open" value={s.open.toString()} />
        <Metric label="Wins" value={s.wins.toString()} tone="bullish" />
        <Metric label="Losses" value={s.losses.toString()} tone="bearish" />
        <Metric label="Expired" value={s.expired.toString()} />
        <Metric
          label="Win Rate"
          value={`${s.winRate.toFixed(1)}%`}
          tone={s.winRate >= 50 ? 'bullish' : 'bearish'}
        />
        <Metric
          label="Avg R"
          value={`${s.averageR >= 0 ? '+' : ''}${s.averageR.toFixed(2)}R`}
          tone={s.averageR > 0 ? 'bullish' : s.averageR < 0 ? 'bearish' : undefined}
        />
      </div>

      {/* Warnings */}
      {s.warnings.length > 0 && (
        <div className="space-y-1.5 rounded-lg border border-yellow-500/30 bg-yellow-500/5 px-3 py-2.5">
          {s.warnings.map((warning) => (
            <div key={warning} className="flex items-start gap-2 text-[11px] text-yellow-300">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
              <span>{warning}</span>
            </div>
          ))}
        </div>
      )}

      {/* Recent paper signals */}
      {paperEntries.length === 0 ? (
        <div className="rounded-lg border border-border-subtle bg-bg-surface-soft px-4 py-6 text-center">
          <p className="text-sm font-medium text-text-secondary">No paper signals yet.</p>
          <p className="mt-1 text-xs text-text-muted">
            Use &quot;Submit as paper&quot; in the Futures Signal panel to begin tracking.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border-subtle">
          <table className="w-full text-[11px]">
            <thead className="bg-bg-surface-raised text-[10px] uppercase tracking-wider text-text-muted">
              <tr>
                <th className="px-2 py-1.5 text-left font-medium">Symbol</th>
                <th className="px-2 py-1.5 text-left font-medium">Action</th>
                <th className="px-2 py-1.5 text-left font-medium">Setup</th>
                <th className="px-2 py-1.5 text-right font-medium">Entry</th>
                <th className="px-2 py-1.5 text-right font-medium">SL</th>
                <th className="px-2 py-1.5 text-right font-medium">Final R</th>
                <th className="px-2 py-1.5 text-left font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {paperEntries.map((entry) => (
                <PaperRow key={entry.id} entry={entry} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function PaperRow({ entry }: { entry: SignalJournalEntry }) {
  return (
    <tr className="border-t border-border-subtle/60">
      <td className="px-2 py-1.5 font-medium text-text-primary">{entry.symbol}</td>
      <td className="px-2 py-1.5">
        <span
          className={cn(
            'rounded-sm px-1.5 py-0.5 text-[10px] font-bold uppercase',
            entry.action === 'LONG' && 'bg-market-up/10 text-market-up',
            entry.action === 'SHORT' && 'bg-market-down/10 text-market-down',
            entry.action === 'WAIT' && 'bg-bg-surface-raised text-text-muted'
          )}
        >
          {entry.action}
        </span>
      </td>
      <td className="px-2 py-1.5 text-text-secondary">
        {entry.setupType ? entry.setupType.replace(/_/g, ' ') : '\u2014'}
      </td>
      <td className="numeric px-2 py-1.5 text-right text-text-primary">
        {entry.entryPrice != null ? formatCurrency(entry.entryPrice) : '\u2014'}
      </td>
      <td className="numeric px-2 py-1.5 text-right text-text-secondary">
        {entry.stopLoss != null ? formatCurrency(entry.stopLoss) : '\u2014'}
      </td>
      <td
        className={cn(
          'numeric px-2 py-1.5 text-right',
          entry.finalR != null && entry.finalR > 0 && 'text-market-up',
          entry.finalR != null && entry.finalR < 0 && 'text-market-down',
          entry.finalR == null && 'text-text-muted'
        )}
      >
        {entry.finalR == null ? '\u2014' : `${entry.finalR >= 0 ? '+' : ''}${entry.finalR.toFixed(2)}R`}
      </td>
      <td className="px-2 py-1.5">
        <StatusPill status={entry.status} />
      </td>
    </tr>
  );
}

function StatusPill({ status }: { status: SignalJournalEntry['status'] }) {
  const map: Record<SignalJournalEntry['status'], { label: string; className: string }> = {
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
        'inline-flex items-center rounded-sm border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider',
        c.className
      )}
    >
      {c.label}
    </span>
  );
}

function Metric({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: 'bullish' | 'bearish';
}) {
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
