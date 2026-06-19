'use client';

import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSignalJournalStore } from '@/stores/use-signal-journal-store';
import { useMarketStore } from '@/stores/use-market-store';
import { cn } from '@/lib/shared/utils';
import { formatCurrency } from '@/lib/shared/formatting';
import { downloadCsv, entriesToCsv } from '@/lib/application/journal/export-csv';
import { computeJournalPnl } from '@/lib/application/journal/pnl';
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
  ChevronLeft,
  ChevronRight,
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
  const pricesByBinanceSymbol = useMarketStore((s) => s.pricesByBinanceSymbol);
  const lastJournalTickRef = useRef(0);

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

  const journalPriceSnapshot = useMemo(() => {
    const snapshot: Record<string, number> = {};
    for (const entry of entries) {
      const live = prices[entry.symbol] ?? pricesByBinanceSymbol[entry.symbol];
      if (live?.price && Number.isFinite(live.price)) {
        snapshot[entry.symbol] = live.price;
      }
    }
    return snapshot;
  }, [entries, prices, pricesByBinanceSymbol]);

  // Auto-update excursions for pending entries based on live prices.
  // Throttled to reduce localStorage writes during high-frequency websocket ticks.
  useEffect(() => {
    if (!hydrated) return;
    const now = Date.now();
    if (now - lastJournalTickRef.current < 1_000) return;
    lastJournalTickRef.current = now;
    applyTickBatch(journalPriceSnapshot, now);
  }, [journalPriceSnapshot, hydrated, applyTickBatch]);

  // Drive expiry independently of prices: even if a symbol's stream pauses,
  // a paper entry with expiresAt should still tick over to EXPIRED.
  useEffect(() => {
    if (!hydrated) return;
    const id = window.setInterval(() => applyTickBatch({}), 30_000);
    return () => window.clearInterval(id);
  }, [hydrated, applyTickBatch]);

  // entries is intentionally listed to invalidate when store entries change;
  // metrics() reads them internally via get().
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const m = useMemo(() => metrics(), [entries, metrics]);
  const filtered = useMemo(
    () => filterAndSort(entries, { search, statusFilter, sourceFilter, sortKey, sortDir }),
    [entries, search, statusFilter, sourceFilter, sortKey, sortDir]
  );

  // Pagination — 24 cards per page keeps the DOM light.
  const PAGE_SIZE = 24;
  const [page, setPage] = useState(0);
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paged = useMemo(
    () => filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE),
    [filtered, page]
  );
  // Reset page when filters change.
  useEffect(() => { setPage(0); }, [search, statusFilter, sourceFilter, sortKey, sortDir]);

  const handleRemoveEntry = useCallback((id: string) => remove(id), [remove]);
  const handleCancelEntry = useCallback((id: string) => updateStatus(id, 'CANCELLED'), [updateStatus]);
  const handleMarkEntryOutcome = useCallback(
    (id: string, status: 'TP1' | 'TP2' | 'TP3' | 'SL' | 'EXPIRED', exit?: number) =>
      markOutcome(id, status, exit),
    [markOutcome]
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
            className="pressable inline-flex items-center gap-1 rounded-md border border-border-subtle bg-bg-surface-raised px-2 py-1 text-[10px] font-medium uppercase tracking-wider text-text-secondary transition-colors hover:border-border-strong hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
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
          className="pressable inline-flex h-8 w-8 items-center justify-center rounded-md border border-border-subtle bg-bg-surface-raised text-text-muted transition-colors hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
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
        <>
          <div className="grid gap-2.5 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5">
            {paged.map((entry) => (
              <JournalCard
                key={entry.id}
                entry={entry}
                livePrice={journalPriceSnapshot[entry.symbol]}
                onRemove={handleRemoveEntry}
                onCancel={handleCancelEntry}
                onMarkOutcome={handleMarkEntryOutcome}
              />
            ))}
          </div>
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 pt-2">
              <button
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0}
                className="pressable inline-flex h-8 w-8 items-center justify-center rounded-md border border-border-subtle bg-bg-surface-raised text-text-muted transition-colors hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
                aria-label="Previous page"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="text-xs font-medium text-text-secondary">
                {page + 1} / {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1}
                className="pressable inline-flex h-8 w-8 items-center justify-center rounded-md border border-border-subtle bg-bg-surface-raised text-text-muted transition-colors hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
                aria-label="Next page"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          )}
        </>
      )}
    </section>
  );
}

// --------------------------------------------------------------------------
// Toolbar / metrics
// --------------------------------------------------------------------------

function MetricsRow({ metrics: m }: { metrics: SignalJournalMetrics }) {
  const closed = m.closed > 0;
  const winRateLabel = closed ? `${m.winRate.toFixed(1)}%` : '—';
  const winTone = closed ? (m.winRate >= 50 ? 'bullish' : 'bearish') : 'neutral';
  const rTone = closed ? (m.closedR > 0 ? 'bullish' : m.closedR < 0 ? 'bearish' : 'neutral') : 'neutral';

  return (
    <div className="space-y-2">
      {/* Hero: 3 large tiles establish the dominant performance signal */}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <HeroMetric
          label="Win Rate"
          primary={winRateLabel}
          tone={winTone}
          progressPct={closed ? Math.min(100, m.winRate) : 0}
          subtitle={closed ? `${Math.round((m.winRate / 100) * m.closed)} of ${m.closed} closed` : 'No closed trades yet'}
        />
        <HeroMetric
          label="Total R"
          primary={closed ? formatR(m.closedR) : '—'}
          tone={rTone}
          subtitle={
            closed
              ? `Avg ${formatR(m.averageR)}R · Best ${formatR(m.bestR)}R · Worst ${formatR(m.worstR)}R`
              : 'Closed R is computed from finalR'
          }
        />
        <HeroMetric
          label="Trades"
          primary={m.total.toString()}
          tone="neutral"
          subtitle={`${m.pending} open · ${m.closed} closed${m.pending > 0 ? ` · Open R ${formatR(m.openR)}` : ''}`}
        />
      </div>

      {/* Distribution strip: single horizontal rail to avoid card-grid sameness */}
      <dl className="flex flex-wrap items-stretch divide-x divide-border-subtle/40 overflow-hidden rounded-md border border-border-subtle/50 bg-bg-surface-soft">
        <DistroItem
          label="Long"
          value={m.longCount.toString()}
          accent={m.longCount > 0 ? `${m.longWinRate.toFixed(0)}% win` : 'no trades'}
          tone="bullish"
        />
        <DistroItem
          label="Short"
          value={m.shortCount.toString()}
          accent={m.shortCount > 0 ? `${m.shortWinRate.toFixed(0)}% win` : 'no trades'}
          tone="bearish"
        />
        <DistroItem label="Manual" value={m.manualCount.toString()} accent="manual entries" tone="neutral" />
        <DistroItem label="Paper" value={m.paperCount.toString()} accent="paper trades" tone="neutral" />
        <DistroItem
          label="Avg Conf"
          value={m.total > 0 ? m.averageConfidence.toFixed(0) : '—'}
          accent="signal score"
          tone="neutral"
        />
      </dl>
    </div>
  );
}

/**
 * Large featured metric with optional progress bar and a subtitle line for
 * supporting context. Carries the dominant visual weight in the metrics row.
 */
function HeroMetric({
  label,
  primary,
  subtitle,
  tone,
  progressPct,
}: {
  label: string;
  primary: string;
  subtitle?: string;
  tone: 'bullish' | 'bearish' | 'neutral';
  progressPct?: number;
}) {
  return (
    <div className="relative overflow-hidden rounded-lg border border-border-subtle/70 bg-bg-surface-soft px-3.5 py-3">
      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-text-muted">{label}</p>
      <p
        className={cn(
          'numeric mt-1.5 text-2xl font-bold leading-none tracking-tight',
          tone === 'bullish' && 'text-market-up',
          tone === 'bearish' && 'text-market-down',
          tone === 'neutral' && 'text-text-primary'
        )}
      >
        {primary}
      </p>
      {progressPct != null && progressPct > 0 && (
        <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-bg-surface-raised/70">
          <div
            className={cn(
              'h-full rounded-full transition-[width] duration-500 ease-out',
              tone === 'bullish' && 'bg-market-up',
              tone === 'bearish' && 'bg-market-down',
              tone === 'neutral' && 'bg-text-secondary/60'
            )}
            style={{ width: `${progressPct}%` }}
          />
        </div>
      )}
      {subtitle && (
        <p className="mt-2 truncate text-[10px] text-text-muted" title={subtitle}>
          {subtitle}
        </p>
      )}
    </div>
  );
}

/**
 * Single cell inside the distribution strip. Uses dl/dt/dd semantics so the
 * row reads as a definition list to assistive tech.
 */
function DistroItem({
  label,
  value,
  accent,
  tone,
}: {
  label: string;
  value: string;
  accent: string;
  tone: 'bullish' | 'bearish' | 'neutral';
}) {
  return (
    <div className="min-w-[96px] flex-1 px-3 py-2">
      <dt className="text-[9px] font-semibold uppercase tracking-[0.14em] text-text-muted">{label}</dt>
      <dd className="mt-0.5 flex items-baseline gap-1.5">
        <span
          className={cn(
            'numeric text-sm font-bold leading-none',
            tone === 'bullish' && 'text-market-up',
            tone === 'bearish' && 'text-market-down',
            tone === 'neutral' && 'text-text-primary'
          )}
        >
          {value}
        </span>
        <span className="truncate text-[10px] text-text-muted">{accent}</span>
      </dd>
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
              : 'text-text-muted hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring'
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
        Save a setup from the Futures Signal panel, or run a paper trade from the journal workflow.
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
const JournalCard = memo(function JournalCard({
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

  // Shows live movement from entry without adding another visual component.
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

  // Highest configured TP gives a simple view of the final target.
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
        <span className="text-[10px] font-medium uppercase tracking-wider text-text-muted">{entry.timeframe}</span>
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
            <p className={cn('numeric text-[10px] font-semibold', liveFavorable ? 'text-market-up' : 'text-market-down')}>
              {liveDeltaPct > 0 ? '+' : ''}{liveDeltaPct.toFixed(2)}%
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
            RR <span className="numeric font-bold text-text-primary">{entry.riskRewardRatio.toFixed(1)}</span>
          </span>
        )}
        {entry.setupType && (
          <span className="capitalize text-text-muted">
            {entry.setupType.toLowerCase().replace(/_/g, ' ')}
          </span>
        )}
        {entry.finalR != null && Number.isFinite(entry.finalR) && (
          <span className={cn('numeric ml-auto font-bold', entry.finalR > 0 ? 'text-market-up' : entry.finalR < 0 ? 'text-market-down' : 'text-text-muted')}>
            {formatR(entry.finalR)}R
          </span>
        )}
      </div>

      {/* ─── Section 5: Tracking (conditional) ─── */}
      {(entry.maxFavorableExcursion != null || entry.maxAdverseExcursion != null || (entry.status === 'PENDING' && entry.expiresAt != null)) && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-border-subtle/30 px-3 py-2 text-[10px] text-text-muted">
          {entry.maxFavorableExcursion != null && (
            <span>MFE <span className="numeric font-semibold text-market-up">{formatCurrency(entry.maxFavorableExcursion)}</span></span>
          )}
          {entry.maxAdverseExcursion != null && (
            <span>MAE <span className="numeric font-semibold text-market-down">{formatCurrency(entry.maxAdverseExcursion)}</span></span>
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
            className="inline-flex h-7 items-center gap-1 rounded-md border border-border-subtle bg-bg-surface-raised px-2 text-[10px] font-semibold text-text-secondary transition-colors hover:border-accent-primary/40 hover:text-accent-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
            aria-label="Mark outcome manually"
          >
            <Pencil className="h-3 w-3" />
            Close
          </button>
          <button
            onClick={() => onCancel(entry.id)}
            className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-border-subtle bg-bg-surface-raised text-text-muted transition-colors hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
            aria-label="Cancel signal"
            title="Cancel"
          >
            <X className="h-3 w-3" />
          </button>
          <button
            onClick={() => onRemove(entry.id)}
            className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-border-subtle bg-bg-surface-raised text-text-muted transition-colors hover:border-market-down/40 hover:text-market-down focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
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
            className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-border-subtle bg-bg-surface-raised text-text-muted transition-colors hover:border-market-down/40 hover:text-market-down focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
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
          className="text-text-muted hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
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
                : 'border-border-subtle bg-bg-surface-raised text-text-muted hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring'
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
          className="rounded-md border border-border-subtle bg-bg-surface-raised px-2 py-1 text-[10px] font-medium text-text-muted transition-colors hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
        >
          Cancel
        </button>
        <button
          disabled={exitInvalid}
          onClick={() => onSubmit(status, exitNum)}
          className="pressable inline-flex items-center gap-1 rounded-md border border-accent-primary/40 bg-accent-primary/10 px-2 py-1 text-[10px] font-semibold text-accent-primary transition-colors hover:bg-accent-primary/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring disabled:cursor-not-allowed disabled:opacity-50"
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

function ActionBadge({ action }: { action: SignalJournalEntry['action'] }) {
  return (
    <span
      className={cn(
        'rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider',
        action === 'LONG' && 'bg-market-up/10 text-market-up',
        action === 'SHORT' && 'bg-market-down/10 text-market-down',
        action === 'WAIT' && 'bg-bg-surface-raised text-text-muted'
      )}
    >
      {action}
    </span>
  );
}

/**
 * Compact price level used by the simplified card.
 * Keeps entry, stop loss, and target visually consistent.
 */
function SimpleLevel({
  label,
  value,
  tone,
}: {
  label: string;
  value: number | null;
  tone?: 'bullish' | 'bearish';
}) {
  return (
    <div className="bg-bg-surface-soft px-3 py-2">
      <p className="text-[9px] font-semibold uppercase tracking-wider text-text-muted">{label}</p>
      <p
        className={cn(
          'numeric mt-0.5 truncate text-xs font-semibold',
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



function StatusPill({ status, className: extraClass }: { status: SignalJournalStatus; className?: string }) {
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
        c.className,
        extraClass
      )}
    >
      {c.label}
    </span>
  );
}
