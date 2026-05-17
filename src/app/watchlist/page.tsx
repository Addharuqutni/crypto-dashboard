'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { AppShell } from '@/components/layout/app-shell';
import { useWatchlistStore } from '@/stores/use-watchlist-store';
import { useMarketStore } from '@/stores/use-market-store';
import { formatCurrency, formatPercentage } from '@/lib/formatting';
import { cn } from '@/lib/utils';
import { Star, TrendingUp, TrendingDown, Minus, Trash2, Search } from 'lucide-react';
import { PriceFreshnessBadge, useFreshnessClock } from '@/components/market/price-freshness-badge';
import { getPriceFreshness } from '@/lib/market/freshness';

/**
 * Watchlist page — full view of user's saved coins with live data.
 */
export default function WatchlistPage() {
  const items = useWatchlistStore((s) => s.items);
  const hydrated = useWatchlistStore((s) => s.hydrated);
  const hydrate = useWatchlistStore((s) => s.hydrate);
  const removeCoin = useWatchlistStore((s) => s.removeCoin);
  const prices = useMarketStore((s) => s.prices);
  const now = useFreshnessClock();

  useEffect(() => {
    hydrate();
  }, [hydrate]);


  if (!hydrated) {
    return (
      <AppShell>
        <div className="card animate-pulse p-6">
          <div className="h-6 w-32 rounded bg-bg-surface-raised" />
          <div className="mt-4 space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-12 rounded bg-bg-surface-raised" />
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
          <h1 className="font-[family-name:var(--font-display)] text-2xl font-bold text-text-primary">
            Watchlist
          </h1>
          <p className="mt-1 text-sm text-text-secondary">
            Your saved coins for quick monitoring.
          </p>
        </div>

        {/* Empty State */}
        {items.length === 0 && (
          <div className="card flex flex-col items-center px-6 py-12 text-center">
            <Star className="h-12 w-12 text-text-muted/30" />
            <h2 className="mt-4 text-lg font-semibold text-text-primary">
              No coins in your watchlist yet
            </h2>
            <p className="mt-2 max-w-sm text-sm text-text-secondary">
              Search for a coin and add it to your watchlist to monitor it here.
            </p>
            <Link
              href="/"
              className="mt-4 inline-flex items-center gap-2 rounded-lg bg-accent-primary/10 px-4 py-2 text-sm font-medium text-accent-primary transition-colors hover:bg-accent-primary/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
            >
              <Search className="h-4 w-4" />
              Explore Market
            </Link>
          </div>
        )}

        {/* Watchlist Table (Desktop) */}
        {items.length > 0 && (
          <>
            <div className="hidden md:block">
              <div className="card overflow-hidden">
                <table className="w-full text-sm">
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
                    {items.map((item) => {
                      const livePrice = prices[item.symbol];
                      const price = livePrice?.price;
                      const change = livePrice?.priceChangePercent24h;
                      const isUp = (change ?? 0) > 0;
                      const isDown = (change ?? 0) < 0;
                      const freshness = getPriceFreshness(livePrice?.receivedAt, now);
                      const isStale = freshness === 'stale';

                      return (
                        <tr
                          key={item.symbol}
                          className="border-b border-border-subtle/50 transition-colors hover:bg-bg-surface-soft/50"
                        >
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
                            <span
                              className={cn(
                                'numeric inline-flex items-center gap-1 text-sm font-medium',
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
                          </td>
                          <td className="px-4 py-3 text-xs text-text-muted">
                            {new Date(item.addedAt).toLocaleDateString()}
                          </td>
                          <td className="px-4 py-3 text-center">
                            <button
                              onClick={() => removeCoin(item.symbol)}
                              className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-text-muted transition-colors hover:bg-danger/10 hover:text-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
                              aria-label={`Remove ${item.symbol} from watchlist`}
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Mobile Card List */}
            <div className="flex flex-col gap-2 md:hidden">
              {items.map((item) => {
                const livePrice = prices[item.symbol];
                const price = livePrice?.price;
                const change = livePrice?.priceChangePercent24h;
                const isUp = (change ?? 0) > 0;
                const isDown = (change ?? 0) < 0;
                const freshness = getPriceFreshness(livePrice?.receivedAt, now);
                const isStale = freshness === 'stale';

                return (
                  <div key={item.symbol} className="card flex items-center gap-3 px-4 py-3">
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
                        </div>
                      </div>
                    </Link>
                    <button
                      onClick={() => removeCoin(item.symbol)}
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-text-muted transition-colors hover:bg-danger/10 hover:text-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
                      aria-label={`Remove ${item.symbol} from watchlist`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}
