'use client';

import Link from 'next/link';
import { useWatchlistStore } from '@/stores/use-watchlist-store';
import { useMarketStore } from '@/stores/use-market-store';
import { formatCurrency, formatPercentage } from '@/lib/shared/formatting';
import { cn } from '@/lib/shared/utils';
import { Star, TrendingUp, TrendingDown, Minus, ArrowRight } from 'lucide-react';

/**
 * Watchlist snapshot — compact preview shown on dashboard sidebar.
 * Shows saved coins with live price and 24h change.
 */
export function WatchlistSnapshot() {
  const items = useWatchlistStore((s) => s.items);
  const prices = useMarketStore((s) => s.prices);

  if (items.length === 0) {
    return (
      <div className="card px-4 py-6 text-center">
        <Star className="mx-auto h-8 w-8 text-text-muted/50" />
        <p className="mt-2 text-sm font-medium text-text-secondary">No coins in your watchlist</p>
        <p className="mt-1 text-xs text-text-muted">
          Search for a coin and add it to monitor here.
        </p>
      </div>
    );
  }

  return (
    <div className="card overflow-hidden">
      <div className="flex items-center justify-between border-b border-border-subtle px-4 py-2.5">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-text-muted">
          Watchlist
        </h3>
        <Link
          href="/watchlist"
          className="inline-flex items-center gap-1 text-xs font-medium text-accent-primary hover:text-accent-primary/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
        >
          View all
          <ArrowRight className="h-3 w-3" />
        </Link>
      </div>
      <div className="divide-y divide-border-subtle/50">
        {items.slice(0, 5).map((item) => {
          const price = prices[item.symbol];
          const change = price?.priceChangePercent24h;
          const isUp = (change ?? 0) > 0;
          const isDown = (change ?? 0) < 0;

          return (
            <Link
              key={item.symbol}
              href={`/coin/${item.symbol.toLowerCase()}`}
              className="flex items-center justify-between px-4 py-2.5 transition-colors hover:bg-bg-surface-soft/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
            >
              <div className="flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-bg-surface text-[10px] font-bold text-accent-primary">
                  {item.symbol.slice(0, 2)}
                </span>
                <span className="text-sm font-medium text-text-primary">{item.symbol}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="numeric text-sm text-text-secondary">
                  {price ? formatCurrency(price.price) : '—'}
                </span>
                {change != null && (
                  <span
                    className={cn(
                      'numeric inline-flex items-center gap-0.5 text-xs font-medium',
                      isUp && 'text-market-up',
                      isDown && 'text-market-down',
                      !isUp && !isDown && 'text-market-neutral'
                    )}
                  >
                    {isUp && <TrendingUp className="h-3 w-3" />}
                    {isDown && <TrendingDown className="h-3 w-3" />}
                    {!isUp && !isDown && <Minus className="h-3 w-3" />}
                    {formatPercentage(change)}
                  </span>
                )}
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
