'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSignalJournalStore } from '@/stores/use-signal-journal-store';
import { useMarketStore } from '@/stores/use-market-store';
import { cn } from '@/lib/shared/utils';
import { downloadCsv, entriesToCsv } from '@/lib/application/journal/export-csv';
import {
  Trash2,
  BookOpen,
  Download,
  Search,
  ArrowDownAZ,
  ArrowUpAZ,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import type { SignalJournalSource } from '@/types/signal-journal';
import { filterAndSort } from './filter-and-sort';
import { MetricsRow, SegmentedControl, EmptyState } from './metrics-row';
import { JournalCard } from './journal-card';

const PAGE_SIZE = 24;
const JOURNAL_TICK_THROTTLE_MS = 1_000;
const EXPIRY_POLL_MS = 30_000;
const CONFIRM_CLEAR_TIMEOUT_MS = 4_000;

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
  const applyTickBatch = useSignalJournalStore((s) => s.applyTickBatch);
  const markOutcome = useSignalJournalStore((s) => s.markOutcome);
  const clearAll = useSignalJournalStore((s) => s.clearAll);
  const metrics = useSignalJournalStore((s) => s.metrics);
  const prices = useMarketStore((s) => s.prices);
  const pricesByBinanceSymbol = useMarketStore((s) => s.pricesByBinanceSymbol);
  const lastJournalTickRef = useRef(0);

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'open' | 'closed'>('all');
  const [sourceFilter, setSourceFilter] = useState<'all' | SignalJournalSource>('all');
  const [sortKey, setSortKey] = useState<'createdAt' | 'finalR' | 'confidence'>('createdAt');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [confirmClear, setConfirmClear] = useState(false);

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

  useEffect(() => {
    if (!hydrated) return;
    const now = Date.now();
    if (now - lastJournalTickRef.current < JOURNAL_TICK_THROTTLE_MS) return;
    lastJournalTickRef.current = now;
    applyTickBatch(journalPriceSnapshot, now);
  }, [journalPriceSnapshot, hydrated, applyTickBatch]);

  useEffect(() => {
    if (!hydrated) return;
    const id = window.setInterval(() => applyTickBatch({}), EXPIRY_POLL_MS);
    return () => window.clearInterval(id);
  }, [hydrated, applyTickBatch]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const m = useMemo(() => metrics(), [entries, metrics]);
  const filtered = useMemo(
    () => filterAndSort(entries, { search, statusFilter, sourceFilter, sortKey, sortDir }),
    [entries, search, statusFilter, sourceFilter, sortKey, sortDir]
  );

  const [page, setPage] = useState(0);
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paged = useMemo(
    () => filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE),
    [filtered, page]
  );
  useEffect(() => {
    setPage(0);
  }, [search, statusFilter, sourceFilter, sortKey, sortDir]);

  const handleRemoveEntry = useCallback((id: string) => remove(id), [remove]);
  const handleCancelEntry = useCallback(
    (id: string) => updateStatus(id, 'CANCELLED'),
    [updateStatus]
  );
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
    <section className="card space-y-4 p-5" aria-labelledby="signal-journal-title">
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
                  window.setTimeout(() => setConfirmClear(false), CONFIRM_CLEAR_TIMEOUT_MS);
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
