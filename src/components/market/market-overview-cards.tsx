'use client';

import { useMemo } from 'react';
import { cn } from '@/lib/shared/utils';
import { formatCurrency, formatPercentage, formatPercentageMagnitude, formatCompactNumber } from '@/lib/shared/formatting';
import { useMarketStore } from '@/stores/use-market-store';
import type { MarketRow } from '@/types/market';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

/**
 * Merges a MarketRow with its live Binance price when available.
 * Falls back to the static row data if WebSocket hasn't delivered yet.
 */
function useLiveRow(row: MarketRow | undefined): MarketRow | undefined {
  const livePrice = useMarketStore((s) => (row ? s.prices[row.symbol] : undefined));

  return useMemo(() => {
    if (!row) return undefined;
    if (!livePrice) return row;

    return {
      ...row,
      price: livePrice.price,
      priceChangePercent24h: livePrice.priceChangePercent24h ?? row.priceChangePercent24h,
    };
  }, [row, livePrice]);
}

/**
 * Market summary cards — BTC, ETH, 24h Volume, Biggest Mover.
 * Each card surfaces a label, main metric, delta indicator, and supporting line.
 * Subscribes to Binance WebSocket for live price display.
 */
export function MarketOverviewCards({ data }: { data: MarketRow[] }) {
  const btcRow = useMemo(() => data.find((d) => d.symbol === 'BTC'), [data]);
  const ethRow = useMemo(() => data.find((d) => d.symbol === 'ETH'), [data]);

  const btc = useLiveRow(btcRow);
  const eth = useLiveRow(ethRow);

  // Calculate total 24h volume
  const totalVolume = data.reduce((sum, d) => sum + (d.volume24h ?? 0), 0);

  // Find biggest mover by absolute percentage change using live prices
  const prices = useMarketStore((s) => s.prices);
  const biggestMover = useMemo(() => {
    return [...data]
      .map((row) => {
        const live = prices[row.symbol];
        return {
          ...row,
          price: live?.price ?? row.price,
          priceChangePercent24h: live?.priceChangePercent24h ?? row.priceChangePercent24h,
        };
      })
      .sort((a, b) => Math.abs(b.priceChangePercent24h ?? 0) - Math.abs(a.priceChangePercent24h ?? 0))[0];
  }, [data, prices]);

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <SummaryCard
        label="Bitcoin"
        marker="BTC"
        value={formatCurrency(btc?.price)}
        change={btc?.priceChangePercent24h}
      />
      <SummaryCard
        label="Ethereum"
        marker="ETH"
        value={formatCurrency(eth?.price)}
        change={eth?.priceChangePercent24h}
      />
      <SummaryCard
        label="24h Volume"
        marker="VOL"
        value={formatCompactNumber(totalVolume)}
        sublabel={`${data.length} assets tracked`}
      />
      {biggestMover && (
        <SummaryCard
          label="Top Mover"
          marker={biggestMover.symbol}
          value={formatCurrency(biggestMover.price)}
          change={biggestMover.priceChangePercent24h}
        />
      )}
    </div>
  );
}

/**
 * One summary card. Uses a small ticker marker instead of decorative icons so
 * the card stays data-first and visually light.
 */
function SummaryCard({
  label,
  marker,
  value,
  change,
  sublabel,
}: {
  label: string;
  marker: string;
  value: string;
  change?: number | null;
  sublabel?: string;
}) {
  const isUp = (change ?? 0) > 0;
  const isDown = (change ?? 0) < 0;

  return (
    <div className="card px-5 py-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium text-text-secondary">{label}</p>
        <span className="numeric rounded-full border border-border-subtle px-2 py-0.5 text-[10px] font-semibold text-text-muted">
          {marker}
        </span>
      </div>
      <p className="numeric mt-3 text-2xl font-semibold tracking-tight text-text-primary">{value}</p>
      {change != null && (
        <div className="mt-2 flex items-center gap-1.5">
          {isUp && <TrendingUp className="h-3.5 w-3.5 text-market-up" aria-hidden="true" />}
          {isDown && <TrendingDown className="h-3.5 w-3.5 text-market-down" aria-hidden="true" />}
          {!isUp && !isDown && <Minus className="h-3.5 w-3.5 text-market-neutral" aria-hidden="true" />}
          <span
            className={cn(
              'numeric text-sm font-medium',
              isUp && 'text-market-up',
              isDown && 'text-market-down',
              !isUp && !isDown && 'text-market-neutral'
            )}
            aria-label={`${isUp ? 'Up' : isDown ? 'Down' : 'Unchanged'} ${formatPercentageMagnitude(change)}`}
          >
            {formatPercentage(change)}
          </span>
        </div>
      )}
      {sublabel && <p className="mt-2 text-sm text-text-muted">{sublabel}</p>}
    </div>
  );
}
