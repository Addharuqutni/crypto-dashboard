'use client';

import { useMemo } from 'react';
import { cn } from '@/lib/shared/utils';
import { formatCurrency, formatPercentage, formatCompactNumber } from '@/lib/shared/formatting';
import { useMarketStore } from '@/stores/use-market-store';
import type { MarketRow } from '@/types/market';
import { TrendingUp, TrendingDown, Minus, Activity, DollarSign, BarChart3 } from 'lucide-react';

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
        icon={<DollarSign className="h-4 w-4" />}
        value={formatCurrency(btc?.price)}
        change={btc?.priceChangePercent24h}
        accent={{ text: 'text-accent-warm', bar: 'bg-accent-warm/60' }}
      />
      <SummaryCard
        label="Ethereum"
        icon={<DollarSign className="h-4 w-4" />}
        value={formatCurrency(eth?.price)}
        change={eth?.priceChangePercent24h}
        accent={{ text: 'text-accent-secondary', bar: 'bg-accent-secondary/60' }}
      />
      <SummaryCard
        label="24h Volume"
        icon={<BarChart3 className="h-4 w-4" />}
        value={formatCompactNumber(totalVolume)}
        sublabel={`${data.length} assets tracked`}
        accent={{ text: 'text-accent-primary', bar: 'bg-accent-primary/60' }}
      />
      {biggestMover && (
        <SummaryCard
          label={`Top Mover — ${biggestMover.symbol}`}
          icon={<Activity className="h-4 w-4" />}
          value={formatCurrency(biggestMover.price)}
          change={biggestMover.priceChangePercent24h}
          accent={{ text: 'text-market-up', bar: 'bg-market-up/60' }}
        />
      )}
    </div>
  );
}

/**
 * One summary card. Each card receives an `accent` pair so the icon color
 * and the top-edge bar stay coordinated without relying on `currentColor`.
 */
function SummaryCard({
  label,
  icon,
  value,
  change,
  sublabel,
  accent,
}: {
  label: string;
  icon: React.ReactNode;
  value: string;
  change?: number | null;
  sublabel?: string;
  accent?: { text: string; bar: string };
}) {
  const isUp = (change ?? 0) > 0;
  const isDown = (change ?? 0) < 0;

  return (
    <div className="card group relative overflow-hidden px-4 py-4">
      {/* Top accent bar — explicit color so the design system stays predictable. */}
      <div className={cn('absolute inset-x-0 top-0 h-[2px]', accent?.bar ?? 'bg-accent-primary/60')} />

      <div className="flex items-center gap-2">
        <span className={cn('opacity-60', accent?.text)}>{icon}</span>
        <p className="text-xs font-medium uppercase tracking-wider text-text-muted">{label}</p>
      </div>
      <p className="numeric mt-2 text-2xl font-bold text-text-primary">{value}</p>
      {change != null && (
        <div className="mt-1.5 flex items-center gap-1">
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
            aria-label={`${isUp ? 'Up' : isDown ? 'Down' : 'Unchanged'} ${formatPercentage(change)}`}
          >
            {formatPercentage(change)}
          </span>
        </div>
      )}
      {sublabel && <p className="mt-1.5 text-xs text-text-muted">{sublabel}</p>}
    </div>
  );
}
