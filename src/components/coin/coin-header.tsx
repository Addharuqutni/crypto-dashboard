'use client';

import Link from 'next/link';
import Image from 'next/image';
import { cn } from '@/lib/shared/utils';
import { formatCurrency, formatPercentage, formatPercentageMagnitude, formatCompactNumber } from '@/lib/shared/formatting';
import { useWatchlistStore } from '@/stores/use-watchlist-store';
import { Star, TrendingUp, TrendingDown, Minus, ArrowLeft } from 'lucide-react';

export interface CoinHeaderStats {
  marketCap?: number;
  volume24h?: number;
  high24h?: number;
  low24h?: number;
}

interface CoinHeaderProps {
  coinName: string;
  coinSymbol: string;
  logoUrl: string | undefined;
  price: number | null | undefined;
  change: number | null | undefined;
  isUp: boolean;
  isDown: boolean;
  stats?: CoinHeaderStats;
}

export function CoinHeader({
  coinName,
  coinSymbol,
  logoUrl,
  price,
  change,
  isUp,
  isDown,
  stats,
}: CoinHeaderProps) {
  const isInWatchlist = useWatchlistStore((s) => s.isInWatchlist(coinSymbol));
  const addCoin = useWatchlistStore((s) => s.addCoin);
  const removeCoin = useWatchlistStore((s) => s.removeCoin);
  const hydrated = useWatchlistStore((s) => s.hydrated);

  return (
    <div className="card p-4">
      {/* Top row: back link + watchlist */}
      <div className="flex items-center justify-between">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-sm text-text-secondary transition-colors hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
        >
          <ArrowLeft className="h-4 w-4" />
          Dashboard
        </Link>

        {hydrated && (
          <button
            onClick={() => {
              if (isInWatchlist) removeCoin(coinSymbol);
              else addCoin(coinSymbol, coinName);
            }}
            className={cn(
              'pressable inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring',
              isInWatchlist
                ? 'bg-accent-warm/10 text-accent-warm hover:bg-accent-warm/20'
                : 'bg-bg-surface-raised text-text-secondary hover:bg-bg-surface-soft hover:text-text-primary'
            )}
            aria-label={isInWatchlist ? `Remove ${coinSymbol} from watchlist` : `Add ${coinSymbol} to watchlist`}
          >
            <Star
              className={cn(
                'h-3.5 w-3.5 transition-transform duration-300',
                isInWatchlist && 'fill-current scale-110'
              )}
            />
            {isInWatchlist ? 'In Watchlist' : 'Add to Watchlist'}
          </button>
        )}
      </div>

      {/* Identity + price row */}
      <div className="mt-3 flex flex-wrap items-center gap-3">
        {logoUrl ? (
          <Image
            src={logoUrl}
            alt={`${coinName} logo`}
            className="h-10 w-10 rounded-full"
            width={40}
            height={40}
            unoptimized
          />
        ) : (
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-bg-surface-raised text-base font-bold text-accent-primary">
            {coinSymbol.slice(0, 2)}
          </span>
        )}

        <div className="flex items-center gap-2">
          <h1 className="text-xl font-bold tracking-tight text-text-primary">
            {coinName}
          </h1>
          <span className="rounded-md bg-bg-surface-raised px-1.5 py-0.5 text-xs font-medium text-text-muted">
            {coinSymbol}
          </span>
        </div>

        <div className="flex items-baseline gap-2.5">
          {price != null ? (
            <span
              className="numeric text-2xl font-bold text-text-primary"
              aria-live="polite"
              aria-label={`Current price ${formatCurrency(price)}`}
            >
              {formatCurrency(price)}
            </span>
          ) : (
            <span className="text-2xl font-bold text-text-muted">—</span>
          )}
          {change != null && (
            <span
              className={cn(
                'numeric inline-flex items-center gap-1 text-sm font-semibold',
                isUp && 'text-market-up',
                isDown && 'text-market-down',
                !isUp && !isDown && 'text-market-neutral'
              )}
              aria-label={`${coinName} is ${isUp ? 'up' : isDown ? 'down' : 'unchanged'} ${formatPercentageMagnitude(change)} in the last 24 hours`}
            >
              {isUp && <TrendingUp className="h-4 w-4" />}
              {isDown && <TrendingDown className="h-4 w-4" />}
              {!isUp && !isDown && <Minus className="h-4 w-4" />}
              {formatPercentage(change)}
            </span>
          )}
        </div>
      </div>

      {/* Inline market stats */}
      {stats && (
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-border-subtle pt-2.5 text-xs">
          <StatInline label="MCap" value={stats.marketCap ? formatCompactNumber(stats.marketCap) : '—'} />
          <StatInline label="Vol" value={stats.volume24h ? formatCompactNumber(stats.volume24h) : '—'} />
          <StatInline label="24H" value={stats.high24h ? formatCurrency(stats.high24h) : '—'} tone="up" />
          <StatInline label="24L" value={stats.low24h ? formatCurrency(stats.low24h) : '—'} tone="down" />
        </div>
      )}
    </div>
  );
}

function StatInline({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: 'up' | 'down';
}) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="text-[10px] font-medium uppercase tracking-wider text-text-muted">{label}</span>
      <span
        className={cn(
          'numeric font-medium',
          tone === 'up' && 'text-market-up/80',
          tone === 'down' && 'text-market-down/80',
          !tone && 'text-text-secondary'
        )}
      >
        {value}
      </span>
    </span>
  );
}
