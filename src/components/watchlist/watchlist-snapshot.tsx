'use client';

import Link from 'next/link';
import { useWatchlistStore } from '@/stores/use-watchlist-store';
import { useMarketStore } from '@/stores/use-market-store';
import { formatCurrency, formatPercentage } from '@/lib/shared/formatting';
import { buildPriceChangeAriaLabel } from '@/lib/shared/a11y/price-change-label';
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
      <div className="card px-5 py-7 text-center">
        <Star className="mx-auto h-7 w-7 text-text-muted/60" aria-hidden="true" />
        <p className="mt-3 text-sm font-medium text-text-primary">No coins in your watchlist</p>
        <p className="mt-1.5 text-sm text-text-muted">
          Search a coin, then star it to monitor live moves here.
        </p>
      </div>
    );
  }

  return (
    <div className="card overflow-hidden">
      <div className="flex items-center justify-between border-b border-border-subtle px-5 py-3">
        <h3 className="text-sm font-medium text-text-secondary">
          Watchlist
        </h3>
        <Link
          href="/watchlist"
          className="inline-flex items-center gap-1 text-sm font-medium text-text-secondary hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
        >
          View all
          <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
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
              className="flex items-center justify-between px-5 py-3 transition-colors hover:bg-bg-surface-soft/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
            >
              <div className="flex items-center gap-2.5">
                <span className="flex h-7 w-7 items-center justify-center rounded-full border border-border-subtle bg-bg-surface text-[10px] font-bold text-accent-primary">
                  {item.symbol.slice(0, 2)}
                </span>
                <span className="text-sm font-medium text-text-primary">{item.symbol}</span>
              </div>
              <div className="flex flex-col items-end gap-0.5">
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
                    aria-label={buildPriceChangeAriaLabel(item.symbol, change)}
                  >
                    {isUp && <TrendingUp className="h-3 w-3" aria-hidden="true" />}
                    {isDown && <TrendingDown className="h-3 w-3" aria-hidden="true" />}
                    {!isUp && !isDown && <Minus className="h-3 w-3" aria-hidden="true" />}
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
