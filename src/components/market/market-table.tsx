'use client';

import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { formatCurrency, formatPercentage, formatCompactNumber } from '@/lib/formatting';
import { useWatchlistStore } from '@/stores/use-watchlist-store';
import { useMarketStore } from '@/stores/use-market-store';
import { TrendingUp, TrendingDown, Minus, Star, LayoutGrid, List, ChevronLeft, ChevronRight } from 'lucide-react';
import type { MarketRow } from '@/types/market';

type DisplayMarketRow = MarketRow;

type SortKey = 'price' | 'priceChangePercent24h' | 'volume24h' | 'marketCap';
type SortDir = 'asc' | 'desc';
type ViewMode = 'table' | 'cards';

const PAGE_SIZE = 48;

/**
 * Top coins section — supports sorting, pagination, and card/table views.
 * Each visible row subscribes to its own live price to avoid full re-renders.
 */
export function MarketTable({ data }: { data: MarketRow[] }) {
  const [sortKey, setSortKey] = useState<SortKey>('marketCap');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [viewMode, setViewMode] = useState<ViewMode>('cards');
  const [currentPage, setCurrentPage] = useState(1);

  const sorted = useMemo(() => {
    return [...data].sort((a, b) => {
      const aVal = a[sortKey] ?? 0;
      const bVal = b[sortKey] ?? 0;
      return sortDir === 'desc' ? bVal - aVal : aVal - bVal;
    });
  }, [data, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const pageStart = (currentPage - 1) * PAGE_SIZE;
  const visibleRows = sorted.slice(pageStart, pageStart + PAGE_SIZE);
  const pageEnd = Math.min(pageStart + visibleRows.length, sorted.length);

  // Reset page when sort changes
  useEffect(() => {
    setCurrentPage(1);
  }, [sortKey, sortDir]);

  useEffect(() => {
    setCurrentPage((page) => Math.min(page, totalPages));
  }, [totalPages]);

  /**
   * Toggles the active sort key/direction.
   * Kept stable so memoized controls/rows are not invalidated by new handlers.
   */
  const toggleSort = useCallback((key: SortKey) => {
    setSortKey((currentKey) => {
      if (currentKey === key) {
        setSortDir((currentDir) => (currentDir === 'desc' ? 'asc' : 'desc'));
        return currentKey;
      }

      setSortDir('desc');
      return key;
    });
  }, []);

  /** Stable pagination handlers to avoid PaginationControls re-renders. */
  const goToPrevious = useCallback(() => {
    setCurrentPage((page) => Math.max(1, page - 1));
  }, []);

  const goToNext = useCallback(() => {
    setCurrentPage((page) => Math.min(totalPages, page + 1));
  }, [totalPages]);

  return (
    <div className="space-y-4">
      {/* Sort + View Controls */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-1">
          {(['marketCap', 'price', 'priceChangePercent24h', 'volume24h'] as SortKey[]).map((key) => (
            <button
              key={key}
              onClick={() => toggleSort(key)}
              className={cn(
                'rounded-md px-2.5 py-1 text-[11px] font-medium uppercase tracking-wider transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring',
                sortKey === key
                  ? 'bg-accent-primary/10 text-accent-primary'
                  : 'text-text-muted hover:bg-bg-surface-soft hover:text-text-secondary'
              )}
              aria-label={`Sort by ${getSortLabel(key)}`}
            >
              {getSortLabel(key)}
            </button>
          ))}
        </div>

        <div className="hidden items-center gap-0.5 rounded-lg border border-border-subtle p-0.5 md:flex">
          <button
            onClick={() => setViewMode('cards')}
            className={cn(
              'rounded-md p-1.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring',
              viewMode === 'cards' ? 'bg-bg-surface-raised text-text-primary' : 'text-text-muted hover:text-text-secondary'
            )}
            aria-label="Card view"
            aria-pressed={viewMode === 'cards'}
          >
            <LayoutGrid className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => setViewMode('table')}
            className={cn(
              'rounded-md p-1.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring',
              viewMode === 'table' ? 'bg-bg-surface-raised text-text-primary' : 'text-text-muted hover:text-text-secondary'
            )}
            aria-label="Table view"
            aria-pressed={viewMode === 'table'}
          >
            <List className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {viewMode === 'table' && (
        <div className="hidden md:block">
          <div className="card overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border-subtle text-left text-xs font-medium uppercase tracking-wider text-text-muted">
                  <th className="px-4 py-3">Coin</th>
                  <th className="px-4 py-3">Price</th>
                  <th className="px-4 py-3">24h</th>
                  <th className="px-4 py-3">Volume</th>
                  <th className="px-4 py-3">Market Cap</th>
                  <th className="px-4 py-3 text-center">Action</th>
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((row) => (
                  <MarketTableRow key={row.symbol} row={row} />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {viewMode === 'cards' && (
        <div className="hidden grid-cols-2 gap-3 md:grid lg:grid-cols-3 xl:grid-cols-4">
          {visibleRows.map((row) => (
            <CoinCard key={row.symbol} row={row} />
          ))}
        </div>
      )}

      <div className="flex flex-col gap-2 md:hidden">
        {visibleRows.map((row) => (
          <MobileMarketCard key={row.symbol} row={row} />
        ))}
      </div>

      {visibleRows.length === 0 && (
        <div className="card px-5 py-10 text-center">
          <p className="text-sm font-semibold text-text-primary">Coin tidak ditemukan</p>
          <p className="mt-1 text-sm text-text-muted">Coba gunakan symbol atau nama coin lain.</p>
        </div>
      )}

      <PaginationControls
        currentPage={currentPage}
        totalPages={totalPages}
        pageStart={pageStart + 1}
        pageEnd={pageEnd}
        totalItems={sorted.length}
        onPrevious={goToPrevious}
        onNext={goToNext}
      />
    </div>
  );
}

/**
 * Renders compact pagination metadata and controls.
 * Keeping pagination separate avoids mixing market-row rendering with list navigation state.
 */
const PaginationControls = memo(function PaginationControls({
  currentPage,
  totalPages,
  pageStart,
  pageEnd,
  totalItems,
  onPrevious,
  onNext,
}: {
  currentPage: number;
  totalPages: number;
  pageStart: number;
  pageEnd: number;
  totalItems: number;
  onPrevious: () => void;
  onNext: () => void;
}) {
  const isPreviousDisabled = currentPage <= 1;
  const isNextDisabled = currentPage >= totalPages;

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-border-subtle bg-bg-surface/40 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-sm text-text-muted">
        Menampilkan <span className="numeric text-text-primary">{totalItems === 0 ? 0 : pageStart}-{pageEnd}</span> dari{' '}
        <span className="numeric text-text-primary">{totalItems}</span> coin
      </p>

      <div className="flex items-center justify-between gap-3 sm:justify-end">
        <span className="numeric text-xs uppercase tracking-wider text-text-muted">
          Page {currentPage} / {totalPages}
        </span>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={onPrevious}
            disabled={isPreviousDisabled}
            className={cn(
              'inline-flex h-9 w-9 items-center justify-center rounded-xl border border-border-subtle transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring',
              isPreviousDisabled
                ? 'cursor-not-allowed text-text-muted/40'
                : 'text-text-secondary hover:border-border-strong hover:text-text-primary'
            )}
            aria-label="Previous market page"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={onNext}
            disabled={isNextDisabled}
            className={cn(
              'inline-flex h-9 w-9 items-center justify-center rounded-xl border border-border-subtle transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring',
              isNextDisabled
                ? 'cursor-not-allowed text-text-muted/40'
                : 'text-text-secondary hover:border-border-strong hover:text-text-primary'
            )}
            aria-label="Next market page"
          >
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>
  );
});

/**
 * Merges one row with its symbol-specific live price.
 * The selector subscribes to a single coin, so unrelated price ticks do not
 * invalidate this row/card.
 */
function useLiveMarketRow(row: MarketRow): DisplayMarketRow {
  const livePrice = useMarketStore((state) => state.prices[row.symbol]);

  return useMemo(() => {
    if (!livePrice) {
      return row;
    }

    return {
      ...row,
      price: livePrice.price,
      priceChangePercent24h: livePrice.priceChangePercent24h ?? row.priceChangePercent24h,
      isLive: true,
      isStale: false,
      lastUpdatedAt: livePrice.receivedAt,
    };
  }, [livePrice, row]);
}

/** Card view row, memoized because formatting/icons are repeated for every coin. */
const CoinCard = memo(function CoinCard({ row }: { row: MarketRow }) {
  const displayRow = useLiveMarketRow(row);
  const isUp = (displayRow.priceChangePercent24h ?? 0) > 0;
  const isDown = (displayRow.priceChangePercent24h ?? 0) < 0;

  return (
    <Link
      href={`/coin/${displayRow.symbol.toLowerCase()}`}
      className={cn(
        'card group relative flex flex-col justify-between overflow-hidden px-4 py-4 transition-all duration-200',
        'hover:border-border-strong hover:shadow-lg hover:shadow-black/10',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring'
      )}
    >
      <div className="flex items-start justify-between">
        <CoinIdentity row={displayRow} size="sm" />
        <WatchlistToggle symbol={displayRow.symbol} name={displayRow.name} />
      </div>

      <div className="mt-3">
        <p className="numeric text-xl font-bold text-text-primary">
          {formatCurrency(displayRow.price)}
        </p>
      </div>

      <div className="mt-2 flex items-center justify-between">
        <PriceChange value={displayRow.priceChangePercent24h} symbol={displayRow.symbol} />
        <span className="numeric text-[11px] text-text-muted">
          Vol {formatCompactNumber(displayRow.volume24h)}
        </span>
      </div>

      <div
        className={cn(
          'pointer-events-none absolute inset-x-0 bottom-0 h-0.5 opacity-0 transition-opacity duration-200 group-hover:opacity-100',
          isUp && 'bg-gradient-to-r from-market-up/60 to-transparent',
          isDown && 'bg-gradient-to-r from-market-down/60 to-transparent',
          !isUp && !isDown && 'bg-gradient-to-r from-market-neutral/40 to-transparent'
        )}
      />
    </Link>
  );
});

/** Table row, memoized to reduce expensive table re-render work. */
const MarketTableRow = memo(function MarketTableRow({ row }: { row: MarketRow }) {
  const displayRow = useLiveMarketRow(row);

  return (
    <tr className="border-b border-border-subtle/50 transition-colors hover:bg-bg-surface-soft/50">
      <td className="px-4 py-3">
        <Link
          href={`/coin/${displayRow.symbol.toLowerCase()}`}
          className="flex items-center gap-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
        >
          <CoinAvatar row={displayRow} size="md" />
          <div>
            <p className="font-medium text-text-primary">{displayRow.name}</p>
            <p className="text-xs text-text-muted">{displayRow.symbol}</p>
          </div>
        </Link>
      </td>
      <td className="numeric px-4 py-3 font-medium text-text-primary">
        {formatCurrency(displayRow.price)}
      </td>
      <td className="px-4 py-3">
        <PriceChange value={displayRow.priceChangePercent24h} symbol={displayRow.symbol} />
      </td>
      <td className="numeric px-4 py-3 text-text-secondary">
        {formatCompactNumber(displayRow.volume24h)}
      </td>
      <td className="numeric px-4 py-3 text-text-secondary">
        {formatCompactNumber(displayRow.marketCap)}
      </td>
      <td className="px-4 py-3 text-center">
        <WatchlistToggle symbol={displayRow.symbol} name={displayRow.name} />
      </td>
    </tr>
  );
});

/** Mobile row uses the same per-symbol subscription strategy as desktop rows. */
const MobileMarketCard = memo(function MobileMarketCard({ row }: { row: MarketRow }) {
  const displayRow = useLiveMarketRow(row);

  return (
    <Link
      href={`/coin/${displayRow.symbol.toLowerCase()}`}
      className="card flex items-center gap-3 px-4 py-3 transition-colors hover:border-border-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
    >
      <CoinAvatar row={displayRow} size="lg" />
      <div className="flex-1">
        <div className="flex items-center justify-between">
          <p className="font-medium text-text-primary">{displayRow.symbol}</p>
          <p className="numeric font-medium text-text-primary">{formatCurrency(displayRow.price)}</p>
        </div>
        <div className="flex items-center justify-between">
          <p className="text-xs text-text-muted">{displayRow.name}</p>
          <PriceChange value={displayRow.priceChangePercent24h} symbol={displayRow.symbol} compact />
        </div>
      </div>
    </Link>
  );
});

/** Renders consistent coin identity for cards. */
function CoinIdentity({ row, size }: { row: DisplayMarketRow; size: 'sm' | 'md' | 'lg' }) {
  return (
    <div className="flex items-center gap-2.5">
      <CoinAvatar row={row} size={size} />
      <div>
        <p className="text-sm font-semibold text-text-primary">{row.symbol}</p>
        <p className="text-[11px] text-text-muted">{row.name}</p>
      </div>
    </div>
  );
}

/** Renders a logo when available, otherwise a stable symbol fallback. */
function CoinAvatar({ row, size }: { row: DisplayMarketRow; size: 'sm' | 'md' | 'lg' }) {
  const sizeClass = size === 'lg' ? 'h-9 w-9' : 'h-8 w-8';

  if (row.logoUrl) {
    const pixelSize = size === 'lg' ? 36 : 32;
    return <img src={row.logoUrl} alt="" className={cn(sizeClass, 'rounded-full')} width={pixelSize} height={pixelSize} />;
  }

  return (
    <span className={cn('flex shrink-0 items-center justify-center rounded-full bg-bg-surface text-xs font-bold text-accent-primary', sizeClass)}>
      {row.symbol.slice(0, 2)}
    </span>
  );
}

/** Formats and labels a 24h price move with accessible direction context. */
const PriceChange = memo(function PriceChange({
  value,
  symbol,
  compact,
}: {
  value?: number | null;
  symbol: string;
  compact?: boolean;
}) {
  const isUp = (value ?? 0) > 0;
  const isDown = (value ?? 0) < 0;

  return (
    <span
      className={cn(
        'numeric inline-flex items-center gap-1 font-medium',
        compact ? 'text-xs' : 'text-sm',
        isUp && 'text-market-up',
        isDown && 'text-market-down',
        !isUp && !isDown && 'text-market-neutral'
      )}
      aria-label={`${symbol} ${isUp ? 'up' : isDown ? 'down' : 'unchanged'} ${formatPercentage(value)}`}
    >
      {isUp && <TrendingUp className="h-3 w-3" aria-hidden="true" />}
      {isDown && <TrendingDown className="h-3 w-3" aria-hidden="true" />}
      {!isUp && !isDown && <Minus className="h-3 w-3" aria-hidden="true" />}
      {formatPercentage(value)}
    </span>
  );
});

/** Watchlist action subscribes only to the symbol membership it renders. */
const WatchlistToggle = memo(function WatchlistToggle({ symbol, name }: { symbol: string; name: string }) {
  const isInWatchlist = useWatchlistStore((state) => state.isInWatchlist(symbol));
  const addCoin = useWatchlistStore((state) => state.addCoin);
  const removeCoin = useWatchlistStore((state) => state.removeCoin);

  const handleClick = useCallback((event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();

    if (isInWatchlist) {
      removeCoin(symbol);
      return;
    }

    addCoin(symbol, name);
  }, [addCoin, isInWatchlist, name, removeCoin, symbol]);

  return (
    <button
      onClick={handleClick}
      className={cn(
        'inline-flex h-7 w-7 items-center justify-center rounded-lg transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring',
        isInWatchlist
          ? 'text-accent-warm hover:text-accent-warm/80'
          : 'text-text-muted hover:text-accent-warm'
      )}
      aria-label={isInWatchlist ? `Remove ${symbol} from watchlist` : `Add ${symbol} to watchlist`}
    >
      <Star className={cn('h-3.5 w-3.5', isInWatchlist && 'fill-current')} />
    </button>
  );
});

/** Returns concise labels for sort controls. */
function getSortLabel(key: SortKey): string {
  switch (key) {
    case 'marketCap':
      return 'MCap';
    case 'price':
      return 'Price';
    case 'priceChangePercent24h':
      return '24h';
    case 'volume24h':
      return 'Vol';
  }
}
