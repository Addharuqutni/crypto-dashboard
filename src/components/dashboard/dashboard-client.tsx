'use client';

import { useMemo } from 'react';
import dynamic from 'next/dynamic';
import { MarketOverviewCards } from '@/components/market/market-overview-cards';
import { MarketTable } from '@/components/market/market-table';
import { useWatchlistStore } from '@/stores/use-watchlist-store';
import { useMarketStore } from '@/stores/use-market-store';
import { useMarketData } from '@/lib/adapters/api/hooks';
import { getCoinBySymbol } from '@/lib/shared/registry/coin-registry';
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

  // Build market rows from ALL live prices in the store.
  // This includes every coin received from !miniTicker@arr (200+ Futures pairs).
  // Registry metadata and CoinGecko data are merged when available.
  const marketData: MarketRow[] = useMemo(() => {
    const metadataMap = coinGeckoData && coinGeckoData.length > 0
      ? buildMetadataMap(coinGeckoData)
      : null;

    const priceEntries = Object.values(prices);

    return priceEntries
      .filter((p) => p.binanceSymbol.endsWith('USDT'))
      .map((price) => livePriceToMarketRow(price, metadataMap))
      .sort((a, b) => (b.marketCap ?? 0) - (a.marketCap ?? 0) || (b.price ?? 0) - (a.price ?? 0));
  }, [prices, coinGeckoData]);

  if (!watchlistHydrated) {
    return <DashboardSkeleton />;
  }

  return (
    <div className="space-y-8">
      {/* Page header — lightweight context */}
      <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
        <h1 className="h2">Markets</h1>
        <p className="text-sm text-text-muted">
          {trackedSymbolCount > 0
            ? `${trackedSymbolCount} pairs tracked`
            : 'Connecting\u2026'}
        </p>
      </div>

      {/* API Error Banner */}
      {isError && (
        <div className="flex items-start gap-3 rounded-xl border border-warning/20 bg-warning/5 px-4 py-3 text-sm text-text-secondary">
          <span className="mt-0.5 inline-block h-2 w-2 shrink-0 rounded-full bg-warning" aria-hidden="true" />
          <span>Market metadata may be outdated. Live prices remain active.</span>
        </div>
      )}

      {/* Market Summary Cards */}
      <MarketOverviewCards data={marketData} />

      {/* Main Grid: Table + Sidebar */}
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1fr_360px] xl:grid-cols-[1fr_400px]">
        {/* Top Coins Table — primary content */}
        <section>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-medium text-text-secondary">
              Futures Market
            </h2>
          </div>
          {isLoading && trackedSymbolCount === 0 ? <TableSkeleton /> : <MarketTable data={marketData} />}
        </section>

        {/* Right Rail — lazy-loaded, secondary content */}
        <aside className="space-y-6">
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

/**

 * Komponen TableSkeleton untuk merender bagian UI terkait table skeleton.

 * Menjaga struktur tampilan tetap terpisah dari halaman atau komponen induk.

 */

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

/**

 * Komponen SidebarSkeleton untuk merender bagian UI terkait sidebar skeleton.

 * Menjaga struktur tampilan tetap terpisah dari halaman atau komponen induk.

 */

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

/**

 * Komponen WidgetSkeleton untuk merender bagian UI terkait widget skeleton.

 * Menjaga struktur tampilan tetap terpisah dari halaman atau komponen induk.

 */

function WidgetSkeleton() {
  return (
    <div className="card px-4 py-5">
      <div className="skeleton h-3 w-24" />
      <div className="skeleton mt-3 h-10 w-16" />
      <div className="skeleton mt-2 h-2 w-full" />
    </div>
  );
}
