'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { cn } from '@/lib/shared/utils';
import { formatCurrency, formatPercentage, formatPercentageMagnitude, formatCompactNumber } from '@/lib/shared/formatting';
import { useMarketStore } from '@/stores/use-market-store';
import type { MarketRow } from '@/types/market';
import { TrendingUp, TrendingDown, Minus, Bitcoin, Coins, BarChart3, Zap } from 'lucide-react';

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

export function MarketOverviewCards({ data }: { data: MarketRow[] }) {
  const btcRow = useMemo(() => data.find((d) => d.symbol === 'BTC'), [data]);
  const ethRow = useMemo(() => data.find((d) => d.symbol === 'ETH'), [data]);

  const btc = useLiveRow(btcRow);
  const eth = useLiveRow(ethRow);

  const totalVolume = data.reduce((sum, d) => sum + (d.volume24h ?? 0), 0);

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
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <SummaryCard
        label="Bitcoin"
        icon={<Bitcoin className="h-4 w-4" />}
        accent="accent-primary"
        href="/coin/BTC"
        value={formatCurrency(btc?.price)}
        change={btc?.priceChangePercent24h}
      />
      <SummaryCard
        label="Ethereum"
        icon={<Coins className="h-4 w-4" />}
        accent="accent-secondary"
        href="/coin/ETH"
        value={formatCurrency(eth?.price)}
        change={eth?.priceChangePercent24h}
      />
      <SummaryCard
        label="24h Volume"
        icon={<BarChart3 className="h-4 w-4" />}
        accent="market-neutral"
        value={formatCompactNumber(totalVolume)}
        sublabel={`${data.length} assets`}
      />
      {biggestMover && (
        <SummaryCard
          label="Top Mover"
          icon={<Zap className="h-4 w-4" />}
          accent={(biggestMover.priceChangePercent24h ?? 0) >= 0 ? 'market-up' : 'market-down'}
          href={`/coin/${biggestMover.symbol}`}
          value={formatCurrency(biggestMover.price)}
          change={biggestMover.priceChangePercent24h}
          moverSymbol={biggestMover.symbol}
        />
      )}
    </div>
  );
}

function SummaryCard({
  label,
  icon,
  accent,
  href,
  value,
  change,
  sublabel,
  moverSymbol,
}: {
  label: string;
  icon: React.ReactNode;
  accent: 'accent-primary' | 'accent-secondary' | 'market-up' | 'market-down' | 'market-neutral';
  href?: string;
  value: string;
  change?: number | null;
  sublabel?: string;
  moverSymbol?: string;
}) {
  const isUp = (change ?? 0) > 0;
  const isDown = (change ?? 0) < 0;

  const accentColor = {
    'accent-primary': 'text-accent-primary',
    'accent-secondary': 'text-accent-secondary',
    'market-up': 'text-market-up',
    'market-down': 'text-market-down',
    'market-neutral': 'text-market-neutral',
  }[accent];

  const accentBg = {
    'accent-primary': 'bg-accent-primary/10',
    'accent-secondary': 'bg-accent-secondary/10',
    'market-up': 'bg-market-up/10',
    'market-down': 'bg-market-down/10',
    'market-neutral': 'bg-bg-surface-raised',
  }[accent];

  const content = (
    <>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={cn('flex h-7 w-7 items-center justify-center rounded-lg', accentBg, accentColor)}>
            {icon}
          </span>
          <p className="text-xs font-medium text-text-secondary">{label}</p>
        </div>
        {moverSymbol && (
          <span className="text-[10px] font-bold text-text-muted">{moverSymbol}</span>
        )}
      </div>
      <p className="numeric mt-2.5 text-xl font-bold tracking-tight text-text-primary">{value}</p>
      {change != null && (
        <div className="mt-1.5 flex items-center gap-1">
          {isUp && <TrendingUp className="h-3 w-3 text-market-up" aria-hidden="true" />}
          {isDown && <TrendingDown className="h-3 w-3 text-market-down" aria-hidden="true" />}
          {!isUp && !isDown && <Minus className="h-3 w-3 text-market-neutral" aria-hidden="true" />}
          <span
            className={cn(
              'numeric text-xs font-semibold',
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
      {sublabel && <p className="mt-1.5 text-xs text-text-muted">{sublabel}</p>}
    </>
  );

  const className = cn(
    'card interactive px-4 py-3',
    href && 'cursor-pointer'
  );

  if (href) {
    return (
      <Link href={href} className={cn(className, 'block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring')}>
        {content}
      </Link>
    );
  }

  return <div className={className}>{content}</div>;
}
