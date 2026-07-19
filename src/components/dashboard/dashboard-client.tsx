'use client';

import { useDeferredValue, useMemo } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { MarketOverviewCards } from '@/components/market/market-overview-cards';
import { MarketTable } from '@/components/market/market-table';
import { useWatchlistStore } from '@/stores/use-watchlist-store';
import { useMarketStore } from '@/stores/use-market-store';
import { useMarketData } from '@/hooks/use-market-data';
import { getCoinBySymbol } from '@/lib/shared/registry/coin-registry';
import { formatCurrency, formatPercentage } from '@/lib/shared/formatting';
import { cn } from '@/lib/shared/utils';
import type { MarketRow, CoinMetadata, LivePrice } from '@/types/market';

/**
 * Lazy-load sidebar widgets — they are below the fold on mobile and secondary
 * on desktop, so deferring them reduces initial JS bundle and render work.
 */
const WatchlistSnapshot = dynamic(
  () => import('@/components/watchlist/watchlist-snapshot').then((m) => m.WatchlistSnapshot),
  { ssr: false, loading: () => <SidebarSkeleton /> }
);

const FearGreedWidget = dynamic(
  () => import('@/components/market/fear-greed-widget').then((m) => m.FearGreedWidget),
  { ssr: false, loading: () => <WidgetSkeleton /> }
);

/**
 * Builds a lookup map from CoinGecko metadata for O(1) access per coin.
 * Avoids O(n²) .find() inside the mapping loop.
 */
function buildMetadataMap(data: CoinMetadata[]): Map<string, CoinMetadata> {
  return new Map(data.map((item) => [item.symbol, item]));
}

/**
 * Converts a LivePrice entry into a MarketRow for display.
 * Merges with registry metadata (name, logo) when available.
 * Falls back to derived name from symbol for coins not in registry.
 */
function livePriceToMarketRow(
  price: LivePrice,
  metadataMap: Map<string, CoinMetadata> | null
): MarketRow {
  const registryCoin = getCoinBySymbol(price.symbol);
  const metadata = metadataMap?.get(price.symbol);

  return {
    symbol: price.symbol,
    name: registryCoin?.name ?? price.binanceSymbol.replace('USDT', ''),
    logoUrl: metadata?.logoUrl,
    price: price.price,
    priceChangePercent24h: price.priceChangePercent24h,
    isLive: true,
    isStale: false,
    lastUpdatedAt: price.receivedAt,
    volume24h: metadata?.volume24h,
    marketCap: metadata?.marketCap,
    high24h: metadata?.high24h,
    low24h: metadata?.low24h,
  };
}

/**
 * Dashboard client — owns all interactive state (stores, queries, live data).
 * Separated from the route page so the server component can stream the shell
 * while this client chunk hydrates independently.
 *
 * Builds market rows from ALL live prices in the store (200+ Futures coins)
 * rather than being limited to the static coin registry.
 */
export function DashboardClient() {
  const watchlistHydrated = useWatchlistStore((s) => s.hydrated);
  const { data: coinGeckoData, isLoading, isError } = useMarketData();
  const prices = useMarketStore((s) => s.prices);
  const trackedSymbolCount = useMarketStore((s) => s.trackedSymbolCount);

  // High-frequency WebSocket updates can arrive several times per second.
  // Deferring the large price map keeps typing, sorting, and navigation responsive
  // while still rendering fresh market data shortly after each batch flush.
  const deferredPrices = useDeferredValue(prices);

  const metadataMap = useMemo(() => {
    return coinGeckoData && coinGeckoData.length > 0 ? buildMetadataMap(coinGeckoData) : null;
  }, [coinGeckoData]);

  // Build market rows from ALL live prices in the store.
  // This includes every coin received from !miniTicker@arr (200+ Futures pairs).
  // Registry metadata and CoinGecko data are merged when available.
  const marketData: MarketRow[] = useMemo(() => {
    const priceEntries = Object.values(deferredPrices);

    return priceEntries
      .filter((p) => p.binanceSymbol.endsWith('USDT'))
      .map((price) => livePriceToMarketRow(price, metadataMap))
      .sort((a, b) => (b.marketCap ?? 0) - (a.marketCap ?? 0) || (b.price ?? 0) - (a.price ?? 0));
  }, [deferredPrices, metadataMap]);

  if (!watchlistHydrated) {
    return <DashboardSkeleton />;
  }

  return (
    <div className="space-y-5">
      {/* Hero — market context with prominent top coins */}
      <div className="card p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold tracking-tight text-text-primary">Markets</h1>
              <span
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider',
                  trackedSymbolCount > 0
                    ? 'border-market-up/30 bg-market-up/5 text-market-up'
                    : 'border-border-subtle bg-bg-surface-soft text-text-muted'
                )}
              >
                <span
                  className={cn(
                    'inline-block h-1.5 w-1.5 rounded-full',
                    trackedSymbolCount > 0 ? 'bg-market-up' : 'animate-pulse bg-text-muted'
                  )}
                />
                {trackedSymbolCount > 0 ? `${trackedSymbolCount} pairs` : 'Connecting'}
              </span>
            </div>
            <p className="mt-1.5 text-sm text-text-muted">Real-time futures market data</p>
          </div>

          {/* Top coins — prominent quick pulse */}
          {marketData.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              {marketData.slice(0, 4).map((coin) => {
                const change = coin.priceChangePercent24h ?? 0;
                const isUp = change >= 0;
                return (
                  <Link
                    key={coin.symbol}
                    href={`/coin/${coin.symbol}`}
                    className="group flex items-center gap-2.5 rounded-lg border border-border-subtle bg-bg-surface-raised px-3 py-2 transition-all hover:border-border-strong hover:shadow-elev-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
                  >
                    <span className="text-xs font-bold text-text-secondary">{coin.symbol}</span>
                    <span className="numeric text-xs font-semibold text-text-primary">
                      {coin.price != null ? formatCurrency(coin.price) : '—'}
                    </span>
                    <span
                      className={cn(
                        'numeric inline-flex items-center gap-0.5 text-[10px] font-semibold',
                        isUp ? 'text-market-up' : 'text-market-down'
                      )}
                    >
                      {isUp ? '+' : ''}
                      {formatPercentage(change)}
                    </span>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* API Error Banner */}
      {isError && (
        <div className="flex items-start gap-3 rounded-xl border border-warning/20 bg-warning/5 px-4 py-3 text-sm text-text-secondary">
          <span
            className="mt-0.5 inline-block h-2 w-2 shrink-0 rounded-full bg-warning"
            aria-hidden="true"
          />
          <span>Market metadata may be outdated. Live prices remain active.</span>
        </div>
      )}

      {/* Market Summary Cards */}
      <MarketOverviewCards data={marketData} />

      {/* Main Grid: Table + Sidebar */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_340px] xl:grid-cols-[1fr_380px]">
        {/* Top Coins Table — primary content */}
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-medium text-text-secondary">Futures Market</h2>
          </div>
          {isLoading && trackedSymbolCount === 0 ? (
            <TableSkeleton />
          ) : (
            <MarketTable data={marketData} />
          )}
        </section>

        {/* Right Rail — lazy-loaded, secondary content */}
        <aside className="space-y-4">
          <WatchlistSnapshot />
          <FearGreedWidget />
        </aside>
      </div>
    </div>
  );
}

/** Lightweight skeleton for initial dashboard load. */
function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="card px-4 py-3.5">
            <div className="skeleton h-3 w-16" />
            <div className="skeleton mt-2 h-7 w-28" />
            <div className="skeleton mt-2 h-3 w-12" />
          </div>
        ))}
      </div>
      <TableSkeleton />
    </div>
  );
}

function TableSkeleton() {
  return (
    <div className="card p-4">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 border-b border-border-subtle/30 py-3">
          <div className="skeleton h-8 w-8 !rounded-full" />
          <div className="skeleton h-4 w-24" />
          <div className="skeleton ml-auto h-4 w-20" />
        </div>
      ))}
    </div>
  );
}

function SidebarSkeleton() {
  return (
    <div className="card px-4 py-5">
      <div className="skeleton h-3 w-20" />
      <div className="mt-3 space-y-2">
        <div className="skeleton h-8" />
        <div className="skeleton h-8" />
        <div className="skeleton h-8" />
      </div>
    </div>
  );
}

function WidgetSkeleton() {
  return (
    <div className="card px-4 py-5">
      <div className="skeleton h-3 w-24" />
      <div className="skeleton mt-3 h-10 w-16" />
      <div className="skeleton mt-2 h-2 w-full" />
    </div>
  );
}
