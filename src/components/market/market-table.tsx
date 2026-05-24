'use client';

import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { cn } from '@/lib/shared/utils';
import { formatCurrency, formatPercentage, formatCompactNumber } from '@/lib/shared/formatting';
import { buildPriceChangeAriaLabel } from '@/lib/shared/a11y/price-change-label';
import { useWatchlistStore } from '@/stores/use-watchlist-store';
import { useMarketStore } from '@/stores/use-market-store';
import { TrendingUp, TrendingDown, Minus, Star, LayoutGrid, List, ChevronLeft, ChevronRight, ArrowDown, ArrowUp } from 'lucide-react';
import { PriceFreshnessBadge, useFreshnessClock } from '@/components/market/price-freshness-badge';
import { getPriceFreshness } from '@/lib/shared/market/freshness';
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
        <div
          className="inline-flex items-center gap-1 rounded-xl border border-border-subtle bg-bg-surface p-1"
          role="group"
          aria-label="Sort coins"
        >
          {(['marketCap', 'price', 'priceChangePercent24h', 'volume24h'] as SortKey[]).map((key) => {
            const isActive = sortKey === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => toggleSort(key)}
                aria-pressed={isActive}
                className={cn(
                  'inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring',
                  isActive
                    ? 'bg-bg-surface-raised text-text-primary'
                    : 'text-text-muted hover:text-text-secondary'
                )}
              >
                {getSortLabel(key)}
                {isActive && (
                  sortDir === 'desc' ? (
                    <ArrowDown className="h-3 w-3 text-text-muted" aria-hidden="true" />
                  ) : (
                    <ArrowUp className="h-3 w-3 text-text-muted" aria-hidden="true" />
                  )
                )}
              </button>
            );
          })}
        </div>

        <div className="hidden items-center gap-0.5 rounded-xl border border-border-subtle bg-bg-surface p-1 md:flex">
          <button
            type="button"
            onClick={() => setViewMode('cards')}
            className={cn(
              'inline-flex h-8 w-8 items-center justify-center rounded-lg transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring',
              viewMode === 'cards' ? 'bg-bg-surface-raised text-text-primary' : 'text-text-muted hover:text-text-secondary'
            )}
            aria-label="Card view"
            aria-pressed={viewMode === 'cards'}
          >
            <LayoutGrid className="h-4 w-4" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => setViewMode('table')}
            className={cn(
              'inline-flex h-8 w-8 items-center justify-center rounded-lg transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring',
              viewMode === 'table' ? 'bg-bg-surface-raised text-text-primary' : 'text-text-muted hover:text-text-secondary'
            )}
            aria-label="Table view"
            aria-pressed={viewMode === 'table'}
          >
            <List className="h-4 w-4" aria-hidden="true" />
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
        <div className="card px-5 py-12 text-center">
          <p className="text-base font-medium text-text-primary">No coins found</p>
          <p className="mt-1.5 text-sm text-text-muted">Try a different sort or check the live connection.</p>
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
    <div className="flex flex-col gap-3 rounded-xl border border-border-subtle bg-bg-surface px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
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
function useLiveMarketRow(row: MarketRow, now: number): DisplayMarketRow {
  const livePrice = useMarketStore((state) => state.prices[row.symbol]);

  return useMemo(() => {
    if (!livePrice) {
      return row;
    }

    const freshness = getPriceFreshness(livePrice.receivedAt, now);

    return {
      ...row,
      price: livePrice.price,
      priceChangePercent24h: livePrice.priceChangePercent24h ?? row.priceChangePercent24h,
      isLive: freshness !== 'stale',
      isStale: freshness === 'stale',
      lastUpdatedAt: livePrice.receivedAt,
    };
  }, [livePrice, now, row]);
}

/**
 * Card view row.
 *
 * Implementation note: WatchlistToggle is rendered as an absolute-positioned
 * sibling so it doesn't end up nested inside an `<a>` (which is invalid HTML
 * and confuses some assistive tech). The Link still covers the surface via
 * `inset-0`; the star sits above it on the z-axis.
 */
const CoinCard = memo(function CoinCard({ row }: { row: MarketRow }) {
  const now = useFreshnessClock();
  const displayRow = useLiveMarketRow(row, now);

  return (
    <div
      className={cn(
        'card group relative flex flex-col justify-between overflow-hidden px-5 py-4 transition-colors duration-200',
        'hover:border-border-strong'
      )}
    >
      {/* Watchlist sits ABOVE the link cover; renders before the link so it
          gets a stable focus order. */}
      <div className="absolute right-3 top-3 z-10">
        <WatchlistToggle symbol={displayRow.symbol} name={displayRow.name} />
      </div>

      {/* Link cover — takes the entire card surface. */}
      <Link
        href={`/coin/${displayRow.symbol.toLowerCase()}`}
        className="absolute inset-0 z-0 rounded-[inherit] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-bg-app"
        aria-label={`Open ${displayRow.symbol} detail`}
      />

      <div className="pointer-events-none relative z-[1] flex items-start justify-between">
        <CoinIdentity row={displayRow} size="sm" />
      </div>

      <div className="pointer-events-none relative z-[1] mt-4 flex items-end justify-between gap-2">
        <p className={cn('numeric text-xl font-semibold tracking-tight text-text-primary', displayRow.isStale && 'text-text-muted')}>
          {formatCurrency(displayRow.price)}
        </p>
        <PriceFreshnessBadge receivedAt={displayRow.lastUpdatedAt} now={now} compact />
      </div>

      <div className="pointer-events-none relative z-[1] mt-2 flex items-center justify-between">
        <PriceChange value={displayRow.priceChangePercent24h} symbol={displayRow.symbol} />
        <span className="numeric text-[11px] text-text-muted">
          Vol {formatCompactNumber(displayRow.volume24h)}
        </span>
      </div>
    </div>
  );
});

/** Table row, memoized to reduce expensive table re-render work. */
const MarketTableRow = memo(function MarketTableRow({ row }: { row: MarketRow }) {
  const now = useFreshnessClock();
  const displayRow = useLiveMarketRow(row, now);

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
      <td className="numeric px-4 py-3 font-medium">
        <div className="flex items-center gap-2 text-text-primary">
          <span className={cn(displayRow.isStale && 'text-text-muted')}>{formatCurrency(displayRow.price)}</span>
          <PriceFreshnessBadge receivedAt={displayRow.lastUpdatedAt} now={now} compact />
        </div>
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
  const now = useFreshnessClock();
  const displayRow = useLiveMarketRow(row, now);

  return (
    <Link
      href={`/coin/${displayRow.symbol.toLowerCase()}`}
      className="card flex items-center gap-3 px-4 py-3 transition-colors hover:border-border-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
    >
      <CoinAvatar row={displayRow} size="lg" />
      <div className="flex-1">
          <div className="flex items-center gap-2">
            <PriceFreshnessBadge receivedAt={displayRow.lastUpdatedAt} now={now} compact />
            <p className={cn('numeric font-medium text-text-primary', displayRow.isStale && 'text-text-muted')}>
              {formatCurrency(displayRow.price)}
            </p>
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

/**
 * Renders a logo when available, otherwise a stable symbol fallback.
 *
 * Uses `next/image` so logos benefit from automatic format negotiation
 * (AVIF/WebP) and lazy loading. `unoptimized` is on by default for remote
 * URLs that aren't on the Next.js image-domain allowlist; remove the flag
 * once `next.config` adds the relevant remote patterns.
 */
function CoinAvatar({ row, size }: { row: DisplayMarketRow; size: 'sm' | 'md' | 'lg' }) {
  const sizeClass = size === 'lg' ? 'h-9 w-9' : 'h-8 w-8';
  const pixelSize = size === 'lg' ? 36 : 32;

  if (row.logoUrl) {
    return (
      <Image
        src={row.logoUrl}
        alt=""
        width={pixelSize}
        height={pixelSize}
        className={cn(sizeClass, 'rounded-full')}
        unoptimized
      />
    );
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
      aria-label={buildPriceChangeAriaLabel(symbol, value)}
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
