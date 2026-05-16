'use client';

import { useMemo } from 'react';
import dynamic from 'next/dynamic';
import { MarketOverviewCards } from '@/components/market/market-overview-cards';
import { MarketTable } from '@/components/market/market-table';
import { useWatchlistStore } from '@/stores/use-watchlist-store';
import { useMarketStore } from '@/stores/use-market-store';
import { useMarketData } from '@/lib/api/hooks';
import { getCoinBySymbol } from '@/lib/registry/coin-registry';
import { generateMockMarketData } from '@/lib/mock-data';
import { getDefaultCoins } from '@/lib/registry/coin-registry';
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

    // If store has live prices, build rows from all of them
    if (priceEntries.length > 0) {
      return priceEntries
        .filter((p) => p.binanceSymbol.endsWith('USDT'))
        .map((price) => livePriceToMarketRow(price, metadataMap))
        .sort((a, b) => (b.marketCap ?? 0) - (a.marketCap ?? 0) || (b.price ?? 0) - (a.price ?? 0));
    }

    // Fallback: use registry coins with mock data while waiting for WebSocket
    const coins = getDefaultCoins();
    return generateMockMarketData(coins);
  }, [prices, coinGeckoData]);

  if (!watchlistHydrated) {
    return <DashboardSkeleton />;
  }

  return (
    <div className="space-y-6">
      {/* API Error Banner */}
      {isError && (
        <div className="rounded-lg border border-warning/30 bg-warning/5 px-4 py-3 text-sm text-warning">
          Market data may be outdated. Using cached or fallback data.
        </div>
      )}

      {/* Market Summary Cards — primary content, renders first */}
      <MarketOverviewCards data={marketData} />

      {/* Main Grid: Table + Sidebar */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_360px] xl:grid-cols-[1fr_400px]">
        {/* Top Coins Table — primary content */}
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-text-muted">
              Futures Market
            </h2>
            <span className="numeric text-xs text-text-muted">
              {trackedSymbolCount} pairs tracked
            </span>
          </div>
          {isLoading && trackedSymbolCount === 0 ? <TableSkeleton /> : <MarketTable data={marketData} />}
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
          <div key={i} className="card animate-pulse px-4 py-3.5">
            <div className="h-3 w-16 rounded bg-bg-surface-raised" />
            <div className="mt-2 h-7 w-28 rounded bg-bg-surface-raised" />
            <div className="mt-2 h-3 w-12 rounded bg-bg-surface-raised" />
          </div>
        ))}
      </div>
      <TableSkeleton />
    </div>
  );
}

function TableSkeleton() {
  return (
    <div className="card animate-pulse p-4">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 border-b border-border-subtle/30 py-3">
          <div className="h-8 w-8 rounded-full bg-bg-surface-raised" />
          <div className="h-4 w-24 rounded bg-bg-surface-raised" />
          <div className="ml-auto h-4 w-20 rounded bg-bg-surface-raised" />
        </div>
      ))}
    </div>
  );
}

function SidebarSkeleton() {
  return (
    <div className="card animate-pulse px-4 py-5">
      <div className="h-3 w-20 rounded bg-bg-surface-raised" />
      <div className="mt-3 space-y-2">
        <div className="h-8 rounded bg-bg-surface-raised" />
        <div className="h-8 rounded bg-bg-surface-raised" />
        <div className="h-8 rounded bg-bg-surface-raised" />
      </div>
    </div>
  );
}

function WidgetSkeleton() {
  return (
    <div className="card animate-pulse px-4 py-5">
      <div className="h-3 w-24 rounded bg-bg-surface-raised" />
      <div className="mt-3 h-10 w-16 rounded bg-bg-surface-raised" />
      <div className="mt-2 h-2 w-full rounded bg-bg-surface-raised" />
    </div>
  );
}
