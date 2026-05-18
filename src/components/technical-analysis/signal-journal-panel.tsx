'use client';

import { useEffect, useMemo, useState } from 'react';
import { useSignalJournalStore } from '@/stores/use-signal-journal-store';
import { useMarketStore } from '@/stores/use-market-store';
import { cn } from '@/lib/utils';
import { formatCurrency } from '@/lib/formatting';
import { downloadCsv, entriesToCsv } from '@/lib/journal/export-csv';
import { computeJournalPnl } from '@/lib/journal/pnl';
import {
  Trash2,
  BookOpen,
  X,
  Download,
  Search,
  ArrowDownAZ,
  ArrowUpAZ,
  AlertTriangle,
  Check,
  Pencil,
} from 'lucide-react';
import type {
  SignalJournalEntry,
  SignalJournalMetrics,
  SignalJournalSource,
  SignalJournalStatus,
} from '@/types/signal-journal';

/**
 * Signal Journal Panel.
 *
 * Lists saved signals, lets the user mark outcomes manually, and shows
 * basic aggregate metrics. Outcome auto-promotion (TP/SL) is driven by the
 * market store's live prices — not fabricated from indicator math.
 *
 * Phase 3 improvements:
 *   - Search + status/source filtering + sort.
 *   - Batched price tick application (single store update per render cycle).
 *   - Per-entry manual outcome override with optional actual exit price.
 *   - CSV export for audit trails.
 *   - Source / regime / setup badges, expiry countdown for paper trades.
 *   - finalR shown on closed entries.
 */
export function SignalJournalPanel() {
  const hydrate = useSignalJournalStore((s) => s.hydrate);
  const hydrated = useSignalJournalStore((s) => s.hydrated);
  const entries = useSignalJournalStore((s) => s.entries);
  const remove = useSignalJournalStore((s) => s.remove);
  const updateStatus = useSignalJournalStore((s) => s.updateStatus);
  const applyTickBatch = useSignalJournalStore((s) => s.applyTickBatch);
  const markOutcome = useSignalJournalStore((s) => s.markOutcome);
  const clearAll = useSignalJournalStore((s) => s.clearAll);
  const metrics = useSignalJournalStore((s) => s.metrics);
  const prices = useMarketStore((s) => s.prices);

  // Filter / sort / search state.
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'open' | 'closed'>('all');
  const [sourceFilter, setSourceFilter] = useState<'all' | SignalJournalSource>('all');
  const [sortKey, setSortKey] = useState<'createdAt' | 'finalR' | 'confidence'>('createdAt');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [confirmClear, setConfirmClear] = useState(false);

  // Hydrate once on mount.
  useEffect(() => {
    if (!hydrated) hydrate();
  }, [hydrate, hydrated]);

  // Auto-update excursions for pending entries based on live prices.
  // Single batched store update per price snapshot — replaces the previous
  // per-entry loop that triggered N rerenders.
  useEffect(() => {
    if (!hydrated) return;
    const snapshot: Record<string, number> = {};
    for (const entry of entries) {
      if (entry.status !== 'PENDING') continue;
      const live = prices[entry.symbol];
      if (live?.price && Number.isFinite(live.price)) {
        snapshot[entry.symbol] = live.price;
      }
    }
    applyTickBatch(snapshot);
  }, [entries, prices, hydrated, applyTickBatch]);

  // Drive expiry independently of prices: even if a symbol's stream pauses,
  // a paper entry with expiresAt should still tick over to EXPIRED.
  useEffect(() => {
    if (!hydrated) return;
    const id = window.setInterval(() => applyTickBatch({}), 30_000);
    return () => window.clearInterval(id);
  }, [hydrated, applyTickBatch]);

  const m = metrics();
  const filtered = useMemo(
    () => filterAndSort(entries, { search, statusFilter, sourceFilter, sortKey, sortDir }),
    [entries, search, statusFilter, sourceFilter, sortKey, sortDir]
  );

  const handleExport = () => {
    if (filtered.length === 0) return;
    const csv = entriesToCsv(filtered);
    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    downloadCsv(`signal-journal-${ts}.csv`, csv);
  };

  return (
    <section className="card space-y-4 px-4 py-4" aria-labelledby="signal-journal-title">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h2
          id="signal-journal-title"
          className="flex items-center gap-2 font-[family-name:var(--font-display)] text-sm font-semibold uppercase tracking-wider text-text-muted"
        >
          <BookOpen className="h-3.5 w-3.5" />
          Signal Journal
        </h2>
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-medium uppercase tracking-wider text-text-muted">
            {filtered.length} / {m.total} shown
          </span>
          <button
            onClick={handleExport}
            disabled={filtered.length === 0}
            className="pressable inline-flex items-center gap-1 rounded-md border border-border-subtle bg-bg-surface-raised px-2 py-1 text-[10px] font-medium uppercase tracking-wider text-text-secondary transition-colors hover:border-border-strong hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
            aria-label="Export filtered entries as CSV"
          >
            <Download className="h-3 w-3" />
            CSV
          </button>
          {entries.length > 0 && (
            <button
              onClick={() => {
                if (confirmClear) {
                  clearAll();
                  setConfirmClear(false);
                } else {
                  setConfirmClear(true);
                  window.setTimeout(() => setConfirmClear(false), 4_000);
                }
              }}
              className={cn(
                'pressable inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[10px] font-medium uppercase tracking-wider transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring',
                confirmClear
                  ? 'border-market-down bg-market-down/15 text-market-down'
                  : 'border-border-subtle bg-bg-surface-raised text-text-muted hover:border-market-down/40 hover:text-market-down'
              )}
              aria-label={confirmClear ? 'Confirm clear all entries' : 'Clear all entries'}
            >
              <Trash2 className="h-3 w-3" />
              {confirmClear ? 'Confirm?' : 'Clear All'}
            </button>
          )}
        </div>
      </header>

      <MetricsRow metrics={m} />

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border-subtle bg-bg-surface-soft px-3 py-2">
        <div className="relative flex-1 min-w-[160px]">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-muted" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search symbol or setup…"
            className="h-8 w-full rounded-md border border-border-subtle bg-bg-surface-raised pl-7 pr-2 text-xs text-text-primary placeholder:text-text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
            aria-label="Search journal entries"
          />
        </div>

        <SegmentedControl
          label="Status"
          value={statusFilter}
          onChange={(v) => setStatusFilter(v as typeof statusFilter)}
          options={[
            { value: 'all', label: 'All' },
            { value: 'open', label: 'Open' },
            { value: 'closed', label: 'Closed' },
          ]}
        />

        <SegmentedControl
          label="Source"
          value={sourceFilter}
          onChange={(v) => setSourceFilter(v as typeof sourceFilter)}
          options={[
            { value: 'all', label: 'All' },
            { value: 'manual', label: 'Manual' },
            { value: 'paper', label: 'Paper' },
            { value: 'backtest', label: 'BT' },
          ]}
        />

        <select
          value={sortKey}
          onChange={(e) => setSortKey(e.target.value as typeof sortKey)}
          className="h-8 rounded-md border border-border-subtle bg-bg-surface-raised px-2 text-xs text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
          aria-label="Sort key"
        >
          <option value="createdAt">Newest</option>
          <option value="finalR">R</option>
          <option value="confidence">Confidence</option>
        </select>

        <button
          onClick={() => setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'))}
          className="pressable inline-flex h-8 w-8 items-center justify-center rounded-md border border-border-subtle bg-bg-surface-raised text-text-muted transition-colors hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
          aria-label={`Toggle sort direction (currently ${sortDir})`}
        >
          {sortDir === 'desc' ? (
            <ArrowDownAZ className="h-3.5 w-3.5" />
          ) : (
            <ArrowUpAZ className="h-3.5 w-3.5" />
          )}
        </button>
      </div>

      {/* Entries — Card Grid */}
      {entries.length === 0 ? (
        <EmptyState />
      ) : filtered.length === 0 ? (
        <div className="rounded-lg border border-border-subtle bg-bg-surface-soft px-4 py-6 text-center">
          <p className="text-sm font-medium text-text-secondary">
            No entries match the current filters.
          </p>
          <p className="mt-1 text-xs text-text-muted">
            Try clearing the search or relaxing the status filter.
          </p>
        </div>
      ) : (
        <div className="grid gap-2.5 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5">
          {filtered.map((entry) => (
            <JournalCard
              key={entry.id}
              entry={entry}
              livePrice={prices[entry.symbol]?.price}
              onRemove={() => remove(entry.id)}
              onCancel={() => updateStatus(entry.id, 'CANCELLED')}
              onMarkOutcome={(status, exit) => markOutcome(entry.id, status, exit)}
            />
          ))}
        </div>
      )}
    </section>
  );
}

// --------------------------------------------------------------------------
// Toolbar / metrics
// --------------------------------------------------------------------------

function MetricsRow({ metrics: m }: { metrics: SignalJournalMetrics }) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <Metric label="Total" value={m.total.toString()} />
        <Metric label="Open" value={m.pending.toString()} />
        <Metric label="Closed" value={m.closed.toString()} />
        <Metric
          label="Win Rate"
          value={m.closed > 0 ? `${m.winRate.toFixed(1)}%` : '—'}
          tone={m.closed > 0 ? (m.winRate >= 50 ? 'bullish' : 'bearish') : undefined}
        />
        <Metric
          label="Avg R"
          value={m.closed > 0 ? formatR(m.averageR) : '—'}
          tone={m.closed > 0 ? (m.averageR > 0 ? 'bullish' : 'bearish') : undefined}
        />
        <Metric
          label="Closed R"
          value={m.closed > 0 ? formatR(m.closedR) : '—'}
          tone={m.closed > 0 ? (m.closedR > 0 ? 'bullish' : 'bearish') : undefined}
        />
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <Metric
          label="LONG"
          value={`${m.longCount} · ${m.longCount > 0 ? m.longWinRate.toFixed(0) + '%' : '—'}`}
          tone="bullish"
        />
        <Metric
          label="SHORT"
          value={`${m.shortCount} · ${m.shortCount > 0 ? m.shortWinRate.toFixed(0) + '%' : '—'}`}
          tone="bearish"
        />
        <Metric label="Open R" value={m.pending > 0 ? formatR(m.openR) : '—'} />
        <Metric
          label="Best / Worst"
          value={
            m.closed > 0 ? `${formatR(m.bestR)} / ${formatR(m.worstR)}` : '— / —'
          }
        />
        <Metric label="Manual / Paper / BT" value={`${m.manualCount} · ${m.paperCount} · ${m.backtestCount}`} />
        <Metric label="Avg Conf" value={m.total > 0 ? m.averageConfidence.toFixed(0) : '—'} />
      </div>
    </div>
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

function SegmentedControl<T extends string>({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: T;
  onChange: (v: T) => void;
  options: Array<{ value: T; label: string }>;
}) {
  return (
    <div
      className="flex items-center gap-1 rounded-md border border-border-subtle bg-bg-surface-raised p-0.5"
      role="group"
      aria-label={label}
    >
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          aria-pressed={value === o.value}
          className={cn(
            'pressable inline-flex h-7 items-center rounded-sm px-2 text-[10px] font-semibold uppercase tracking-wider transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring',
            value === o.value
              ? 'bg-accent-primary/15 text-accent-primary'
              : 'text-text-muted hover:text-text-primary'
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="rounded-lg border border-border-subtle bg-bg-surface-soft px-4 py-8 text-center">
      <BookOpen className="mx-auto h-6 w-6 text-text-muted" />
      <p className="mt-2 text-sm font-medium text-text-secondary">No saved signals yet.</p>
      <p className="mt-1 text-xs text-text-muted">
        Save a setup from the Futures Signal panel, or run a paper trade from the backtest page.
      </p>
    </div>
  );
}

// --------------------------------------------------------------------------
// Card
// --------------------------------------------------------------------------

/**
 * Individual signal journal card.
 */
function JournalCard({
  entry,
  livePrice,
  onRemove,
  onCancel,
  onMarkOutcome,
}: {
  entry: SignalJournalEntry;
  livePrice: number | undefined;
  onRemove: () => void;
  onCancel: () => void;
  onMarkOutcome: (
    status: 'TP1' | 'TP2' | 'TP3' | 'SL' | 'EXPIRED',
    actualExit?: number
  ) => void;
}) {
  const [overrideOpen, setOverrideOpen] = useState(false);
  const pnl = computeJournalPnl(entry, livePrice);
  const isClosed =
    entry.status === 'TP1' ||
    entry.status === 'TP2' ||
    entry.status === 'TP3' ||
    entry.status === 'SL' ||
    entry.status === 'EXPIRED';

  return (
    <article
      className={cn(
        'relative flex flex-col gap-2.5 rounded-lg border bg-bg-surface-soft p-3 transition-shadow hover:shadow-md',
        entry.status === 'SL' && 'border-market-down/30',
        (entry.status === 'TP1' || entry.status === 'TP2' || entry.status === 'TP3') &&
          'border-market-up/30',
        entry.status === 'PENDING' && 'border-border-subtle',
        entry.status === 'CANCELLED' && 'border-border-subtle/50 opacity-60',
        entry.status === 'EXPIRED' && 'border-border-subtle/50'
      )}
    >
      {/* Header: Action + Symbol + Meta */}
      <div className="flex items-center gap-2">
        <span
          className={cn(
            'rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider',
            entry.action === 'LONG' && 'bg-market-up/10 text-market-up',
            entry.action === 'SHORT' && 'bg-market-down/10 text-market-down',
            entry.action === 'WAIT' && 'bg-bg-surface-raised text-text-muted'
          )}
        >
          {entry.action}
        </span>
        <span className="text-sm font-bold text-text-primary">{entry.symbol}</span>
        <span className="text-[10px] uppercase text-text-muted">{entry.timeframe}</span>
        {entry.source && entry.source !== 'manual' && <SourceBadge source={entry.source} />}
        <span className="ml-auto rounded-sm border border-border-subtle bg-bg-surface-raised px-1.5 py-0.5 text-[10px] font-bold text-text-secondary">
          {entry.signalGrade}
        </span>
      </div>

      {/* Hero: PnL + Status */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-baseline gap-2 min-w-0">
          {pnl.percent != null ? (
            <span
              className={cn(
                'numeric truncate text-lg font-bold leading-tight',
                pnl.percent > 0 && 'text-market-up',
                pnl.percent < 0 && 'text-market-down',
                pnl.percent === 0 && 'text-text-muted'
              )}
            >
              {pnl.percent > 0 ? '+' : ''}
              {pnl.percent.toFixed(2)}%
            </span>
          ) : (
            <span className="text-lg font-bold text-text-muted">—</span>
          )}
          <span className="text-[10px] uppercase tracking-wider text-text-muted">
            {pnl.percent == null ? 'PnL' : pnl.realized ? 'Real' : 'Unreal'}
          </span>
          {entry.finalR != null && Number.isFinite(entry.finalR) && (
            <span
              className={cn(
                'numeric ml-1 text-[11px] font-semibold',
                entry.finalR > 0 && 'text-market-up',
                entry.finalR < 0 && 'text-market-down',
                entry.finalR === 0 && 'text-text-muted'
              )}
            >
              {formatR(entry.finalR)}R
            </span>
          )}
        </div>
        <StatusPill status={entry.status} />
      </div>

      {/* Price Grid */}
      <div className="grid grid-cols-3 gap-2 rounded-md border border-border-subtle/50 bg-bg-surface-raised/40 px-2.5 py-1.5">
        <PriceCell label="Entry" value={entry.entryPrice} />
        <PriceCell label="SL" value={entry.stopLoss} tone="bearish" />
        <PriceCell label="Live" value={livePrice ?? null} />
      </div>

      {/* Take Profits */}
      {entry.tp1 != null && (
        <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[10px]">
          <span className="font-medium uppercase tracking-wider text-text-muted">TP</span>
          <span className="numeric font-medium text-market-up">{formatCurrency(entry.tp1)}</span>
          {entry.tp2 != null && (
            <>
              <span className="text-text-muted">·</span>
              <span className="numeric font-medium text-market-up">
                {formatCurrency(entry.tp2)}
              </span>
            </>
          )}
          {entry.tp3 != null && (
            <>
              <span className="text-text-muted">·</span>
              <span className="numeric font-medium text-market-up">
                {formatCurrency(entry.tp3)}
              </span>
            </>
          )}
        </div>
      )}

      {/* Setup metadata */}
      {(entry.setupType || entry.marketRegime) && (
        <div className="flex flex-wrap gap-1 text-[10px] text-text-muted">
          {entry.setupType && (
            <span className="rounded-sm border border-border-subtle bg-bg-surface-raised/60 px-1.5 py-0.5 uppercase tracking-wider">
              {entry.setupType.toLowerCase().replace(/_/g, ' ')}
            </span>
          )}
          {entry.marketRegime && (
            <span className="rounded-sm border border-border-subtle bg-bg-surface-raised/60 px-1.5 py-0.5 uppercase tracking-wider">
              {entry.marketRegime.toLowerCase().replace(/_/g, ' ')}
            </span>
          )}
          {entry.riskRewardRatio != null && (
            <span className="rounded-sm border border-border-subtle bg-bg-surface-raised/60 px-1.5 py-0.5 numeric">
              RR {entry.riskRewardRatio.toFixed(2)}
            </span>
          )}
        </div>
      )}

      {/* Expiry countdown — only for paper trades that haven't closed yet. */}
      {entry.status === 'PENDING' && entry.expiresAt != null && (
        <ExpiryCountdown expiresAt={entry.expiresAt} />
      )}

      {/* Footer: Excursions + Confidence + Actions */}
      <div className="flex items-end justify-between gap-2 border-t border-border-subtle/50 pt-1.5">
        <div className="flex flex-wrap gap-x-2 gap-y-0.5 text-[9px] text-text-muted">
          {entry.maxFavorableExcursion != null && (
            <span>
              MFE{' '}
              <span className="numeric font-medium text-market-up">
                {formatCurrency(entry.maxFavorableExcursion)}
              </span>
            </span>
          )}
          {entry.maxAdverseExcursion != null && (
            <span>
              MAE{' '}
              <span className="numeric font-medium text-market-down">
                {formatCurrency(entry.maxAdverseExcursion)}
              </span>
            </span>
          )}
          <span>
            Conf{' '}
            <span className="font-medium text-text-secondary">{entry.confidenceScore}</span>
          </span>
        </div>

        <div className="flex items-center gap-0.5">
          {entry.status === 'PENDING' && (
            <>
              <button
                onClick={() => setOverrideOpen((v) => !v)}
                className="inline-flex h-6 items-center gap-0.5 rounded border border-border-subtle bg-bg-surface-raised px-1.5 text-[9px] font-medium text-text-muted transition-colors hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
                aria-label="Mark outcome manually"
              >
                <Pencil className="h-2.5 w-2.5" />
                Close
              </button>
              <button
                onClick={onCancel}
                className="inline-flex h-6 w-6 items-center justify-center rounded border border-border-subtle bg-bg-surface-raised text-text-muted transition-colors hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
                aria-label="Cancel signal"
              >
                <X className="h-2.5 w-2.5" />
              </button>
            </>
          )}
          <button
            onClick={onRemove}
            className="inline-flex h-6 w-6 items-center justify-center rounded border border-border-subtle bg-bg-surface-raised text-text-muted transition-colors hover:text-market-down focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
            aria-label="Remove journal entry"
          >
            <Trash2 className="h-2.5 w-2.5" />
          </button>
        </div>
      </div>

      {overrideOpen && entry.status === 'PENDING' && (
        <ManualClosePopover
          entry={entry}
          onCancel={() => setOverrideOpen(false)}
          onSubmit={(status, exit) => {
            onMarkOutcome(status, exit);
            setOverrideOpen(false);
          }}
        />
      )}

      {!overrideOpen && isClosed && entry.finalR != null && Number.isFinite(entry.finalR) && (
        <p className="rounded border border-border-subtle/40 bg-bg-surface-raised/30 px-1.5 py-0.5 text-[9px] text-text-muted">
          Closed at {formatR(entry.finalR)}R · {entry.status}
        </p>
      )}
    </article>
  );
}

function ManualClosePopover({
  entry,
  onSubmit,
  onCancel,
}: {
  entry: SignalJournalEntry;
  onSubmit: (
    status: 'TP1' | 'TP2' | 'TP3' | 'SL' | 'EXPIRED',
    actualExit?: number
  ) => void;
  onCancel: () => void;
}) {
  const [status, setStatus] = useState<'TP1' | 'TP2' | 'TP3' | 'SL' | 'EXPIRED'>('TP1');
  const [exit, setExit] = useState<string>('');

  const exitNum = exit.trim() === '' ? undefined : Number(exit);
  const exitInvalid = exit.trim() !== '' && (!Number.isFinite(exitNum) || (exitNum ?? 0) <= 0);

  return (
    <div className="space-y-2 rounded-lg border border-accent-primary/30 bg-accent-primary/5 p-2.5">
      <div className="flex items-start justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-accent-primary">
          Mark outcome
        </p>
        <button
          onClick={onCancel}
          className="text-text-muted hover:text-text-primary"
          aria-label="Cancel manual close"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="flex flex-wrap gap-1">
        {(['TP1', 'TP2', 'TP3', 'SL', 'EXPIRED'] as const).map((s) => (
          <button
            key={s}
            onClick={() => setStatus(s)}
            aria-pressed={status === s}
            className={cn(
              'pressable rounded-sm border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider transition-colors',
              status === s
                ? 'border-accent-primary/60 bg-accent-primary/15 text-accent-primary'
                : 'border-border-subtle bg-bg-surface-raised text-text-muted hover:text-text-primary'
            )}
          >
            {s}
          </button>
        ))}
      </div>
      {status !== 'EXPIRED' && (
        <label className="flex flex-col gap-1 text-[10px] text-text-muted">
          <span className="font-medium uppercase tracking-wider">Actual exit (optional)</span>
          <input
            type="number"
            step="any"
            value={exit}
            onChange={(e) => setExit(e.target.value)}
            placeholder={String(canonicalLevel(entry, status) ?? '')}
            className={cn(
              'h-8 rounded-md border bg-bg-surface-raised px-2 text-xs text-text-primary numeric focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring',
              exitInvalid ? 'border-market-down' : 'border-border-subtle'
            )}
          />
          {exitInvalid && (
            <span className="flex items-center gap-1 text-[10px] text-market-down">
              <AlertTriangle className="h-3 w-3" />
              Enter a positive number or leave blank.
            </span>
          )}
        </label>
      )}
      <div className="flex justify-end gap-1">
        <button
          onClick={onCancel}
          className="rounded-md border border-border-subtle bg-bg-surface-raised px-2 py-1 text-[10px] font-medium text-text-muted transition-colors hover:text-text-primary"
        >
          Cancel
        </button>
        <button
          disabled={exitInvalid}
          onClick={() => onSubmit(status, exitNum)}
          className="pressable inline-flex items-center gap-1 rounded-md border border-accent-primary/40 bg-accent-primary/10 px-2 py-1 text-[10px] font-semibold text-accent-primary transition-colors hover:bg-accent-primary/20 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Check className="h-3 w-3" />
          Confirm
        </button>
      </div>
    </div>
  );
}

function ExpiryCountdown({ expiresAt }: { expiresAt: number }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  const remaining = expiresAt - now;
  if (remaining <= 0) {
    return (
      <p className="rounded border border-accent-warm/30 bg-accent-warm/5 px-1.5 py-0.5 text-[9px] text-accent-warm">
        Awaiting expiry tick…
      </p>
    );
  }

  return (
    <p className="text-[9px] text-text-muted">
      Expires in <span className="numeric font-medium text-text-secondary">{formatDuration(remaining)}</span>
    </p>
  );
}

function SourceBadge({ source }: { source: SignalJournalSource }) {
  const map: Record<SignalJournalSource, { label: string; className: string }> = {
    manual: {
      label: 'Manual',
      className: 'border-border-subtle bg-bg-surface-raised text-text-muted',
    },
    paper: {
      label: 'Paper',
      className: 'border-accent-primary/40 bg-accent-primary/10 text-accent-primary',
    },
    backtest: {
      label: 'BT',
      className: 'border-accent-secondary/40 bg-accent-secondary/10 text-accent-secondary',
    },
  };
  const c = map[source];
  return (
    <span
      className={cn(
        'rounded-sm border px-1 py-0.5 text-[9px] font-bold uppercase tracking-wider',
        c.className
      )}
    >
      {c.label}
    </span>
  );
}

// --------------------------------------------------------------------------
// Helpers
// --------------------------------------------------------------------------

interface FilterArgs {
  search: string;
  statusFilter: 'all' | 'open' | 'closed';
  sourceFilter: 'all' | SignalJournalSource;
  sortKey: 'createdAt' | 'finalR' | 'confidence';
  sortDir: 'asc' | 'desc';
}

/**
 * Pure filter+sort. Extracted so it can be unit-tested separately and so
 * the panel keeps a single useMemo with stable deps.
 */
export function filterAndSort(
  entries: SignalJournalEntry[],
  args: FilterArgs
): SignalJournalEntry[] {
  const q = args.search.trim().toLowerCase();
  let out = entries.filter((e) => {
    if (
      args.statusFilter === 'open' &&
      !(e.status === 'PENDING' || e.status === 'CANCELLED')
    ) {
      return false;
    }
    if (
      args.statusFilter === 'closed' &&
      !(e.status === 'TP1' || e.status === 'TP2' || e.status === 'TP3' || e.status === 'SL' || e.status === 'EXPIRED')
    ) {
      return false;
    }
    if (args.sourceFilter !== 'all') {
      const src = e.source ?? 'manual';
      if (src !== args.sourceFilter) return false;
    }
    if (q.length > 0) {
      const hay = `${e.symbol} ${e.setupType ?? ''} ${e.marketRegime ?? ''}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  out = [...out].sort((a, b) => {
    const dir = args.sortDir === 'desc' ? -1 : 1;
    if (args.sortKey === 'createdAt') {
      return (a.createdAt - b.createdAt) * dir;
    }
    if (args.sortKey === 'confidence') {
      return (a.confidenceScore - b.confidenceScore) * dir;
    }
    // finalR — push nulls to the bottom regardless of direction.
    const ar = a.finalR ?? null;
    const br = b.finalR ?? null;
    if (ar == null && br == null) return 0;
    if (ar == null) return 1;
    if (br == null) return -1;
    return (ar - br) * dir;
  });

  return out;
}

function canonicalLevel(
  entry: SignalJournalEntry,
  status: 'TP1' | 'TP2' | 'TP3' | 'SL' | 'EXPIRED'
): number | null {
  if (status === 'TP1') return entry.tp1 ?? null;
  if (status === 'TP2') return entry.tp2 ?? null;
  if (status === 'TP3') return entry.tp3 ?? null;
  if (status === 'SL') return entry.stopLoss;
  return null;
}

function formatDuration(ms: number): string {
  const totalMin = Math.floor(ms / 60_000);
  if (totalMin < 60) return `${totalMin}m`;
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h < 24) return `${h}h ${m}m`;
  const d = Math.floor(h / 24);
  const rh = h % 24;
  return `${d}d ${rh}h`;
}

function formatR(v: number): string {
  if (!Number.isFinite(v)) return '∞';
  return v >= 0 ? `+${v.toFixed(2)}` : v.toFixed(2);
}

/** PnL math now lives in `@/lib/journal/pnl` so the same logic powers cards,
 *  exports, and tests. */

/** Small price cell used inside the card's price grid. */
function PriceCell({
  label,
  value,
  tone,
}: {
  label: string;
  value: number | null;
  tone?: 'bullish' | 'bearish';
}) {
  return (
    <div className="min-w-0">
      <p className="text-[9px] font-medium uppercase tracking-wider text-text-muted">{label}</p>
      <p
        className={cn(
          'numeric mt-0.5 truncate text-xs font-semibold leading-tight',
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
    PENDING: {
      label: 'Pending',
      className: 'border-accent-primary/30 bg-accent-primary/10 text-accent-primary',
    },
    TP1: { label: 'TP1', className: 'border-market-up/30 bg-market-up/5 text-market-up' },
    TP2: { label: 'TP2', className: 'border-market-up/40 bg-market-up/10 text-market-up' },
    TP3: { label: 'TP3', className: 'border-market-up/50 bg-market-up/15 text-market-up' },
    SL: { label: 'SL', className: 'border-market-down/40 bg-market-down/10 text-market-down' },
    EXPIRED: {
      label: 'Expired',
      className: 'border-text-muted/30 bg-bg-surface-raised text-text-muted',
    },
    CANCELLED: {
      label: 'Cancelled',
      className: 'border-text-muted/20 bg-bg-surface-raised text-text-muted',
    },
  };
  const c = map[status];
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider',
        c.className
      )}
    >
      {c.label}
    </span>
  );
}
