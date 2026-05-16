'use client';

import { memo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchFearGreedIndex } from '@/lib/api/fear-greed';
import { formatCurrency, formatPercentage, formatRelativeTime } from '@/lib/formatting';
import { cn } from '@/lib/utils';
import { useMarketStore } from '@/stores/use-market-store';
import type { ConnectionStatus, LivePrice } from '@/types/market';

const PULSE_SYMBOLS = ['BTC', 'ETH', 'SOL'] as const;

type PulseSymbol = (typeof PULSE_SYMBOLS)[number];

const CHIP_VISIBILITY_CLASS: Record<PulseSymbol, string | undefined> = {
  BTC: undefined,
  ETH: 'hidden sm:flex',
  SOL: 'hidden lg:flex',
};

/**
 * LiveTicker owns high-frequency live price subscriptions for the pulse strip.
 * Keeping this isolated prevents the entire layout shell from re-rendering on
 * every Binance tick.
 */
export function LiveTicker() {
  return (
    <>
      {PULSE_SYMBOLS.map((symbol) => (
        <LiveTickerChip key={symbol} symbol={symbol} className={CHIP_VISIBILITY_CLASS[symbol]} />
      ))}
    </>
  );
}

/**
 * Subscribes to one symbol only, so BTC ticks do not re-render ETH/SOL chips.
 */
const LiveTickerChip = memo(function LiveTickerChip({
  symbol,
  className,
}: {
  symbol: PulseSymbol;
  className?: string;
}) {
  const price = useMarketStore((state) => state.prices[symbol]);

  if (!price) {
    return null;
  }

  return (
    <PulseChip
      symbol={symbol}
      price={price.price}
      change={price.priceChangePercent24h}
      className={className}
    />
  );
});

/**
 * LiveConnectionSummary owns slower connection metadata separately from price
 * ticks so ticker data does not invalidate connection UI unnecessarily.
 */
export function LiveConnectionSummary() {
  const connectionStatus = useMarketStore((state) => state.connectionStatus);
  const lastUpdateAt = useMarketStore((state) => state.lastUpdateAt);

  return (
    <>
      <div className="flex shrink-0 items-center gap-1.5">
        <StatusDot status={connectionStatus} />
        <ConnectionStatusLabel status={connectionStatus} />
      </div>

      <div className="h-3 w-px shrink-0 bg-border-subtle" />

      <span className="shrink-0 text-text-muted">
        {lastUpdateAt ? `Updated ${formatRelativeTime(lastUpdateAt)}` : 'Awaiting data'}
      </span>
    </>
  );
}

/**
 * FearGreedTicker loads low-frequency market sentiment independently from live
 * WebSocket prices, avoiding accidental coupling between polling and tick UI.
 */
export function FearGreedTicker() {
  const { data: fearGreed } = useQuery({
    queryKey: ['fear-greed-index'],
    queryFn: fetchFearGreedIndex,
    staleTime: 60 * 60 * 1000,
    refetchInterval: 60 * 60 * 1000,
    retry: 1,
  });

  if (!fearGreed) {
    return null;
  }

  return (
    <>
      <div className="hidden h-3 w-px shrink-0 bg-border-subtle lg:block" />
      <div className="hidden shrink-0 items-center gap-1.5 lg:flex">
        <span className="text-text-muted">F&G:</span>
        <span
          className={cn(
            'numeric font-semibold',
            fearGreed.value <= 24 && 'text-market-down',
            fearGreed.value > 24 && fearGreed.value <= 44 && 'text-[#f97316]',
            fearGreed.value > 44 && fearGreed.value <= 55 && 'text-accent-warm',
            fearGreed.value > 55 && fearGreed.value <= 74 && 'text-[#84cc16]',
            fearGreed.value > 74 && 'text-market-up'
          )}
          aria-label={`Fear and Greed Index: ${fearGreed.value}, ${fearGreed.label}`}
        >
          {fearGreed.value} {fearGreed.label}
        </span>
      </div>
    </>
  );
}

/** Connection status dot with appropriate color and animation. */
function StatusDot({ status }: { status: ConnectionStatus }) {
  return (
    <span
      className={cn(
        'inline-block h-2 w-2 rounded-full',
        status === 'connected' && 'bg-market-up',
        status === 'reconnecting' && 'bg-warning animate-pulse',
        status === 'disconnected' && 'bg-market-down'
      )}
      aria-hidden="true"
    />
  );
}

/** Converts connection state into concise user-facing copy for the pulse strip. */
function ConnectionStatusLabel({ status }: { status: ConnectionStatus }) {
  return (
    <span
      className={cn(
        'font-medium',
        status === 'connected' && 'text-market-up',
        status === 'reconnecting' && 'text-warning',
        status === 'disconnected' && 'text-market-down'
      )}
    >
      {status === 'connected' && 'Live'}
      {status === 'reconnecting' && 'Reconnecting'}
      {status === 'disconnected' && 'Offline'}
    </span>
  );
}

/** Mini price chip for pulse strip. */
function PulseChip({
  symbol,
  price,
  change,
  className,
}: {
  symbol: string;
  price: LivePrice['price'];
  change?: LivePrice['priceChangePercent24h'];
  className?: string;
}) {
  const isUp = (change ?? 0) > 0;
  const isDown = (change ?? 0) < 0;

  return (
    <div className={cn('flex shrink-0 items-center gap-1.5', className)}>
      <span className="font-medium text-text-secondary">{symbol}</span>
      <span className="numeric font-medium text-text-primary">{formatCurrency(price, 0)}</span>
      {change != null && (
        <span
          className={cn(
            'numeric font-medium',
            isUp && 'text-market-up',
            isDown && 'text-market-down',
            !isUp && !isDown && 'text-market-neutral'
          )}
          aria-label={`${symbol} is ${isUp ? 'up' : isDown ? 'down' : 'unchanged'} ${formatPercentage(change)}`}
        >
          {isUp && '▲'}
          {isDown && '▼'}
          {!isUp && !isDown && '—'}
          {formatPercentage(change)}
        </span>
      )}
    </div>
  );
}
