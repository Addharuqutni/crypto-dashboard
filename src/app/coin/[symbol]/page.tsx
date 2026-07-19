'use client';

import { useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { AppShell } from '@/components/layout/app-shell';
import { CoinHeader } from '@/components/coin/coin-header';
import type { CoinHeaderStats } from '@/components/coin/coin-header';
import { CoinChartSection } from '@/components/coin/coin-chart-section';
import { CoinAnalysisSection } from '@/components/coin/coin-analysis-section';
import { useMarketStore } from '@/stores/use-market-store';
import { useCoinMetadata } from '@/hooks/use-market-data';
import { getCoinBySymbol, resolveBinanceSymbol } from '@/lib/shared/registry/coin-registry';
import { fetchSingleTicker24hr } from '@/lib/adapters/binance/binance-futures-client';
import { ArrowLeft } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import type { ChartTimeframe } from '@/types/chart';

import { useCoinMarketData } from '@/hooks/use-coin-market-data';
import { useCoinHeaderState } from '@/hooks/use-coin-header-state';
import { useTechnicalAnalysis } from '@/hooks/use-technical-analysis';
import { useActionCall } from '@/hooks/use-action-call';

type ChartMode = 'clean' | 'technical';

/**
 * Coin detail page — composition root.
 *
 * Route: /coin/[symbol]
 *
 * The page resolves the coin identity, wires up market data, and delegates
 * all rendering to focused child components. Business logic (indicator
 * computation, signal generation) lives in dedicated hooks.
 */
export default function CoinDetailPage() {
  const params = useParams();
  const symbolParam = (params.symbol as string)?.toUpperCase() ?? '';

  // --- Coin identity. ---
  const coin = getCoinBySymbol(symbolParam);
  const coinName = coin?.name ?? symbolParam;
  const coinSymbol = coin?.symbol ?? symbolParam;
  const coingeckoId = coin?.coingeckoId;
  const livePrice = useMarketStore((s) => s.prices[symbolParam]);
  const hasCoin = !!(coin || livePrice);

  // --- Page-level UI state. ---
  const [timeframe, setTimeframe] = useState<ChartTimeframe>('24H');
  const [chartMode, setChartMode] = useState<ChartMode>('technical');
  const [activeIndicators, setActiveIndicators] = useState<Set<string>>(
    new Set(['MA25', 'RSI', 'MACD', 'S/R', 'Fib', 'OB'])
  );

  const isTechnicalMode = chartMode === 'technical';

  const handleToggleIndicator = useCallback((key: string) => {
    setActiveIndicators((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  // --- Market data. ---
  const { candles, chartLoading, chartError } = useCoinMarketData({
    symbol: symbolParam,
    timeframe,
    enabled: hasCoin,
    isTechnicalMode,
  });

  // --- Header state. ---
  const { price, change, isUp, isDown } = useCoinHeaderState({
    candles,
    marketStorePrice: livePrice?.price,
    marketStoreChange: livePrice?.priceChangePercent24h,
  });

  // --- Technical analysis. ---
  const analysis = useTechnicalAnalysis({ candles, isTechnicalMode });

  // --- Python Action Call (primary signal source). ---
  const actionCall = useActionCall({
    symbol: coinSymbol,
    isTechnicalMode,
  });

  // --- CoinGecko metadata. ---
  const { data: metadata } = useCoinMetadata(coingeckoId);

  // --- 24hr ticker for inline stats. ---
  const binanceSymbol = resolveBinanceSymbol(coinSymbol);
  const { data: ticker24hr } = useQuery({
    queryKey: ['futures-ticker-24hr', binanceSymbol],
    queryFn: () => fetchSingleTicker24hr(binanceSymbol),
    staleTime: 60 * 1000,
    refetchInterval: 60 * 1000,
  });

  const stats: CoinHeaderStats = {
    marketCap: metadata?.marketCap,
    volume24h: metadata?.volume24h ?? (ticker24hr ? parseFloat(ticker24hr.quoteVolume) : undefined),
    high24h: metadata?.high24h ?? (ticker24hr ? parseFloat(ticker24hr.highPrice) : undefined),
    low24h: metadata?.low24h ?? (ticker24hr ? parseFloat(ticker24hr.lowPrice) : undefined),
  };

  // --- Timeframe list. ---
  const timeframes: ChartTimeframe[] = ['5m', '15m', '30m', '1H', '4H', '24H', '7D', '30D'];

  // Invalid coin — not in registry AND no live price data.
  if (!hasCoin) {
    return (
      <AppShell>
        <div className="card flex flex-col items-center px-6 py-12 text-center">
          <h1 className="text-xl font-bold text-text-primary">Coin not found</h1>
          <p className="mt-2 text-sm text-text-secondary">
            The symbol &ldquo;{symbolParam}&rdquo; is not available.
          </p>
          <Link
            href="/"
            className="mt-4 inline-flex items-center gap-2 rounded-lg bg-accent-primary/10 px-4 py-2 text-sm font-medium text-accent-primary transition-colors hover:bg-accent-primary/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Dashboard
          </Link>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="space-y-4">
        <CoinHeader
          coinName={coinName}
          coinSymbol={coinSymbol}
          logoUrl={metadata?.logoUrl}
          price={price}
          change={change}
          isUp={isUp}
          isDown={isDown}
          stats={stats}
        />

        <CoinChartSection
          candles={candles}
          symbol={coinSymbol}
          timeframe={timeframe}
          chartLoading={chartLoading}
          chartError={chartError}
          chartMode={chartMode}
          onChartModeChange={setChartMode}
          timeframes={timeframes}
          onTimeframeChange={setTimeframe}
          activeIndicators={activeIndicators}
          onToggleIndicator={handleToggleIndicator}
        />

        <CoinAnalysisSection
          chartMode={chartMode}
          candles={candles}
          symbol={coinSymbol}
          timeframe={timeframe}
          price={price}
          analysis={analysis}
          actionCall={actionCall.data?.signal ?? null}
          actionCallLoading={actionCall.isLoading}
          actionCallError={
            actionCall.error instanceof Error
              ? actionCall.error.message
              : actionCall.error
                ? String(actionCall.error)
                : null
          }
          activeIndicators={activeIndicators}
          onSwitchToTechnical={() => setChartMode('technical')}
        />
      </div>
    </AppShell>
  );
}
