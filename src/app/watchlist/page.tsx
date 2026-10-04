'use client';

import { memo, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { AppShell } from '@/components/layout/app-shell';
import { EmptyState } from '@/components/ui/empty-state';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useWatchlistStore } from '@/stores/use-watchlist-store';
import { useMarketStore } from '@/stores/use-market-store';
import { formatCurrency, formatPercentage } from '@/lib/shared/formatting';
import { buildPriceChangeAriaLabel } from '@/lib/shared/a11y/price-change-label';
import { cn } from '@/lib/shared/utils';
import { Star, TrendingUp, TrendingDown, Minus, Trash2, Search, ChevronUp, ChevronDown } from 'lucide-react';
import { PriceFreshnessBadge, useFreshnessClock } from '@/components/market/price-freshness-badge';
import { getPriceFreshness } from '@/lib/shared/market/freshness';
import type { LivePrice, WatchlistItem } from '@/types/market';

/**
 * Derived per-symbol live quote used by both the desktop row and the mobile
 * card. Extracted so the two views cannot drift on price, 24h change or
 * staleness.
 */
interface WatchlistQuote {
  livePrice: LivePrice | undefined;
  price: number | undefined;
  change: number | undefined;
  isStale: boolean;
}

function useWatchlistQuote(symbol: string, now: number): WatchlistQuote {
  const livePrice = useMarketStore((s) => s.prices[symbol]);
  const price = livePrice?.price;
  const change = livePrice?.priceChangePercent24h;
  const freshness = getPriceFreshness(livePrice?.receivedAt, now);
  return { livePrice, price, change, isStale: freshness === 'stale' };
}

/**
 * Desktop table row. Each row subscribes to a single symbol so unrelated
 * price ticks don't re-render the rest of the watchlist.
 */
const WatchlistRow = memo(function WatchlistRow({
  item,
  now,
  isFirst,
  isLast,
  onRemove,
  onMoveUp,
  onMoveDown,
}: {
  item: WatchlistItem;
  now: number;
  isFirst: boolean;
  isLast: boolean;
  onRemove: (symbol: string) => void;
  onMoveUp: (symbol: string) => void;
  onMoveDown: (symbol: string) => void;
}) {
  const { livePrice, price, change, isStale } = useWatchlistQuote(item.symbol, now);

  return (
    <tr className="border-b border-border-subtle/50 transition-colors hover:bg-bg-surface-soft/50">
      <td className="px-4 py-3">
        <Link
          href={`/coin/${item.symbol.toLowerCase()}`}
          className="flex items-center gap-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
        >
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-bg-surface text-xs font-bold text-accent-primary">
            {item.symbol.slice(0, 2)}
          </span>
          <div>
            <p className="font-medium text-text-primary">{item.name}</p>
            <p className="text-xs text-text-muted">{item.symbol}</p>
          </div>
        </Link>
      </td>
      <td className="numeric px-4 py-3 font-medium">
        <div className="flex items-center gap-2 text-text-primary">
          <span className={cn(isStale && 'text-text-muted')}>{formatCurrency(price)}</span>
          <PriceFreshnessBadge receivedAt={livePrice?.receivedAt} now={now} compact />
        </div>
      </td>
      <td className="px-4 py-3">
        <ChangePill symbol={item.symbol} change={change} />
      </td>
      <td className="px-4 py-3 text-xs text-text-muted">
        {new Date(item.addedAt).toLocaleDateString()}
      </td>
      <td className="px-4 py-3">
        <RowActions
          item={item}
          isFirst={isFirst}
          isLast={isLast}
          onRemove={onRemove}
          onMoveUp={onMoveUp}
          onMoveDown={onMoveDown}
        />
      </td>
    </tr>
  );
});

/** Mobile card list entry — same quote hook and pill as the desktop row. */
const WatchlistCard = memo(function WatchlistCard({
  item,
  now,
  isFirst,
  isLast,
  onRemove,
  onMoveUp,
  onMoveDown,
}: {
  item: WatchlistItem;
  now: number;
  isFirst: boolean;
  isLast: boolean;
  onRemove: (symbol: string) => void;
  onMoveUp: (symbol: string) => void;
  onMoveDown: (symbol: string) => void;
}) {
  const { livePrice, price, change, isStale } = useWatchlistQuote(item.symbol, now);

  return (
    <div className="card flex items-center gap-3 px-4 py-3">
      <Link
        href={`/coin/${item.symbol.toLowerCase()}`}
        className="flex flex-1 items-center gap-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-bg-surface text-xs font-bold text-accent-primary">
          {item.symbol.slice(0, 2)}
        </span>
        <div className="flex-1">
          <div className="flex items-center justify-between">
            <p className="font-medium text-text-primary">{item.symbol}</p>
            <div className="flex items-center gap-2">
              <PriceFreshnessBadge receivedAt={livePrice?.receivedAt} now={now} compact />
              <p className={cn('numeric font-medium text-text-primary', isStale && 'text-text-muted')}>
                {formatCurrency(price)}
              </p>
            </div>
          </div>
          <div className="flex items-center justify-between">
            <p className="text-xs text-text-muted">{item.name}</p>
            <ChangePill symbol={item.symbol} change={change} compact />
          </div>
        </div>
      </Link>
      <RowActions
        item={item}
        isFirst={isFirst}
        isLast={isLast}
        onRemove={onRemove}
        onMoveUp={onMoveUp}
        onMoveDown={onMoveDown}
        className="shrink-0"
      />
    </div>
  );
});

/**
 * Reorder + delete controls shared by both layouts.
 *
 * Real `<button>`s (no drag-only), disabled at the list edges so the first
 * item cannot move up and the last cannot move down.
 */
const RowActions = memo(function RowActions({
  item,
  isFirst,
  isLast,
  onRemove,
  onMoveUp,
  onMoveDown,
  className,
}: {
  item: WatchlistItem;
  isFirst: boolean;
  isLast: boolean;
  onRemove: (symbol: string) => void;
  onMoveUp: (symbol: string) => void;
  onMoveDown: (symbol: string) => void;
  className?: string;
}) {
  return (
    <div className={cn('flex items-center justify-center gap-1', className)}>
      <Button
        variant="ghost"
        icon
        onClick={() => onMoveUp(item.symbol)}
        disabled={isFirst}
        aria-label={`Move ${item.symbol} up`}
      >
        <ChevronUp className="h-3.5 w-3.5" />
      </Button>
      <Button
        variant="ghost"
        icon
        onClick={() => onMoveDown(item.symbol)}
        disabled={isLast}
        aria-label={`Move ${item.symbol} down`}
      >
        <ChevronDown className="h-3.5 w-3.5" />
      </Button>
      <Button
        variant="danger-ghost"
        icon
        onClick={() => onRemove(item.symbol)}
        aria-label={`Remove ${item.symbol} from watchlist`}
      >
        <Trash2 className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
});

/** Shared 24h-change pill. `compact` matches the mobile card's smaller type. */
function ChangePill({ symbol, change, compact }: { symbol: string; change: number | undefined; compact?: boolean }) {
  const isUp = (change ?? 0) > 0;
  const isDown = (change ?? 0) < 0;

  return (
    <span
      className={cn(
        'numeric inline-flex items-center font-medium',
        compact ? 'gap-0.5 text-xs' : 'gap-1 text-sm',
        isUp && 'text-market-up',
        isDown && 'text-market-down',
        !isUp && !isDown && 'text-market-neutral'
      )}
      aria-label={buildPriceChangeAriaLabel(symbol, change)}
    >
      {isUp && <TrendingUp className="h-3 w-3" aria-hidden="true" />}
      {isDown && <TrendingDown className="h-3 w-3" aria-hidden="true" />}
      {!isUp && !isDown && <Minus className="h-3 w-3" aria-hidden="true" />}
      {formatPercentage(change)}
    </span>
  );
}

/**
 * Watchlist page — full view of user's saved coins with live data.
 */
export default function WatchlistPage() {
  const items = useWatchlistStore((s) => s.items);
  const hydrated = useWatchlistStore((s) => s.hydrated);
  const hydrate = useWatchlistStore((s) => s.hydrate);
  const removeCoin = useWatchlistStore((s) => s.removeCoin);
  const moveUp = useWatchlistStore((s) => s.moveUp);
  const moveDown = useWatchlistStore((s) => s.moveDown);
  const now = useFreshnessClock();
  const [pendingRemove, setPendingRemove] = useState<string | null>(null);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  // Stable so memoized rows are not invalidated on every page render.
  const handleRemove = useCallback((symbol: string) => setPendingRemove(symbol), []);


  if (!hydrated) {
    return (
      <AppShell>
        <div className="card p-6">
          <div className="skeleton h-6 w-32" />
          <div className="mt-4 space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="skeleton h-12" />
            ))}
          </div>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="space-y-6">
        {/* Page Header */}
        <div>
          <h1 className="h1">
            Watchlist
          </h1>
          <p className="mt-1 text-sm text-text-secondary">
            Your saved coins for quick monitoring.
          </p>
        </div>

        {/* Empty State */}
        {items.length === 0 && (
          <EmptyState
            icon={Star}
            title="No coins in your watchlist yet"
            description="Search for a coin and add it to your watchlist to monitor it here."
          >
            <Link
              href="/"
              className="pressable inline-flex items-center gap-2 rounded-lg bg-accent-primary/10 px-4 py-2 text-sm font-medium text-accent-primary transition-colors hover:bg-accent-primary/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
            >
              <Search className="h-4 w-4" />
              Explore Market
            </Link>
          </EmptyState>
        )}

        {/* Watchlist Table (Desktop) */}
        {items.length > 0 && (
          <>
            <div className="hidden md:block">
              <div className="card overflow-hidden">
                <table className="w-full text-sm">
                  <caption className="sr-only">
                    Watchlist coins with live price and 24 hour change
                  </caption>
                  <thead>
                    <tr className="border-b border-border-subtle text-left text-xs font-medium uppercase tracking-wider text-text-muted">
                      <th className="px-4 py-3">Coin</th>
                      <th className="px-4 py-3">Price</th>
                      <th className="px-4 py-3">24h Change</th>
                      <th className="px-4 py-3">Added</th>
                      <th className="px-4 py-3 text-center">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item, index) => (
                      <WatchlistRow
                        key={item.symbol}
                        item={item}
                        now={now}
                        isFirst={index === 0}
                        isLast={index === items.length - 1}
                        onRemove={handleRemove}
                        onMoveUp={moveUp}
                        onMoveDown={moveDown}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Mobile Card List */}
            <div className="flex flex-col gap-2 md:hidden">
              {items.map((item, index) => (
                <WatchlistCard
                  key={item.symbol}
                  item={item}
                  now={now}
                  isFirst={index === 0}
                  isLast={index === items.length - 1}
                  onRemove={handleRemove}
                  onMoveUp={moveUp}
                  onMoveDown={moveDown}
                />
              ))}
            </div>
          </>
        )}
      </div>

      <ConfirmDialog
        open={pendingRemove !== null}
        title={`Remove ${pendingRemove ?? ''} from watchlist?`}
        description="You can add it back anytime from the market table."
        confirmLabel="Remove"
        onConfirm={() => {
          if (pendingRemove) removeCoin(pendingRemove);
          setPendingRemove(null);
        }}
        onCancel={() => setPendingRemove(null)}
      />
    </AppShell>
  );
}
