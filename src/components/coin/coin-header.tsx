'use client';

import Link from 'next/link';
import { cn } from '@/lib/shared/utils';
import { formatCurrency, formatPercentage } from '@/lib/shared/formatting';
import { useWatchlistStore } from '@/stores/use-watchlist-store';
import { Star, TrendingUp, TrendingDown, Minus, ArrowLeft } from 'lucide-react';

interface CoinHeaderProps {
  coinName: string;
  coinSymbol: string;
  logoUrl: string | undefined;
  price: number | null | undefined;
  change: number | null | undefined;
  isUp: boolean;
  isDown: boolean;
}

/**
 * Coin identity header: logo, name, live price, 24h change, watchlist toggle.
 *
 * Kept as a pure presentational component — all data is passed in from the
 * page-level hooks so the header never triggers its own fetches.
 */
export function CoinHeader({
  coinName,
  coinSymbol,
  logoUrl,
  price,
  change,
  isUp,
  isDown,
}: CoinHeaderProps) {
  const isInWatchlist = useWatchlistStore((s) => s.isInWatchlist(coinSymbol));
  const addCoin = useWatchlistStore((s) => s.addCoin);
  const removeCoin = useWatchlistStore((s) => s.removeCoin);
  const hydrated = useWatchlistStore((s) => s.hydrated);

  return (
    <>
      {/* Back link */}
      <Link
        href="/"
        className="inline-flex items-center gap-1.5 text-sm text-text-secondary transition-colors hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
      >
        <ArrowLeft className="h-4 w-4" />
        Dashboard
      </Link>

      {/* Coin Identity */}
      <div className="flex flex-wrap items-center gap-4">
        {logoUrl ? (
          <img
            src={logoUrl}
            alt={`${coinName} logo`}
            className="h-12 w-12 rounded-full"
            width={48}
            height={48}
          />
        ) : (
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-bg-surface-raised text-lg font-bold text-accent-primary">
            {coinSymbol.slice(0, 2)}
          </span>
        )}

        <div>
          <div className="flex items-center gap-2">
            <h1 className="font-[family-name:var(--font-display)] text-2xl font-bold text-text-primary">
              {coinName}
            </h1>
            <span className="rounded-md bg-bg-surface-raised px-2 py-0.5 text-xs font-medium text-text-muted">
              {coinSymbol}
            </span>
          </div>
          <div className="mt-1 flex items-center gap-3">
            {price != null ? (
              <span
                className="numeric inline-flex items-baseline gap-2 text-3xl font-bold text-text-primary"
                aria-live="polite"
                aria-label={`Current price ${formatCurrency(price)}`}
              >
                {formatCurrency(price)}
              </span>
            ) : (
              <span className="text-3xl font-bold text-text-muted">—</span>
            )}
            {change != null && (
              <span
                className={cn(
                  'numeric inline-flex items-center gap-1 text-lg font-semibold',
                  isUp && 'text-market-up',
                  isDown && 'text-market-down',
                  !isUp && !isDown && 'text-market-neutral'
                )}
                aria-label={`${coinName} is ${isUp ? 'up' : isDown ? 'down' : 'unchanged'} ${formatPercentage(change)} in the last 24 hours`}
              >
                {isUp && <TrendingUp className="h-5 w-5" />}
                {isDown && <TrendingDown className="h-5 w-5" />}
                {!isUp && !isDown && <Minus className="h-5 w-5" />}
                {formatPercentage(change)}
              </span>
            )}
          </div>
        </div>

        {/* Watchlist Button */}
        {hydrated && (
          <button
            onClick={() => {
              if (isInWatchlist) removeCoin(coinSymbol);
              else addCoin(coinSymbol, coinName);
            }}
            className={cn(
              'pressable ml-auto inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring',
              isInWatchlist
                ? 'bg-accent-warm/10 text-accent-warm hover:bg-accent-warm/20'
                : 'bg-bg-surface-raised text-text-secondary hover:bg-bg-surface-soft hover:text-text-primary'
            )}
            aria-label={isInWatchlist ? `Remove ${coinSymbol} from watchlist` : `Add ${coinSymbol} to watchlist`}
          >
            <Star
              className={cn(
                'h-4 w-4 transition-transform duration-300',
                isInWatchlist && 'fill-current scale-110'
              )}
            />
            {isInWatchlist ? 'In Watchlist' : 'Add to Watchlist'}
          </button>
        )}
      </div>
    </>
  );
}
