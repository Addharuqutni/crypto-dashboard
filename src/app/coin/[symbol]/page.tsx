'use client';

import { useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { AppShell } from '@/components/layout/app-shell';
import { CoinHeader } from '@/components/coin/coin-header';
import { CoinChartSection } from '@/components/coin/coin-chart-section';
import { CoinAnalysisSection } from '@/components/coin/coin-analysis-section';
import { useMarketStore } from '@/stores/use-market-store';
import { useCoinMetadata } from '@/lib/api/hooks';
import { getCoinBySymbol } from '@/lib/registry/coin-registry';
import { fetchSingleTicker24hr } from '@/lib/binance/binance-futures-client';
import { formatCurrency, formatCompactNumber } from '@/lib/formatting';
import { ArrowLeft } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { resolveBinanceSymbol } from '@/lib/registry/coin-registry';
import type { ChartTimeframe } from '@/types/chart';

import { useCoinMarketData } from '@/hooks/use-coin-market-data';
import { useCoinHeaderState } from '@/hooks/use-coin-header-state';
import { useTechnicalAnalysis } from '@/hooks/use-technical-analysis';
import { useFuturesSignal } from '@/hooks/use-futures-signal';

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
  const [chartMode, setChartMode] = useState<ChartMode>('clean');
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
  const {
    candles,
    chartLoading,
    chartError,
    macroCandles,
    triggerCandles,
    funding,
    oiSnapshot,
  } = useCoinMarketData({
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

  // --- Futures signal. ---
  const futuresSignal = useFuturesSignal({
    symbol: coinSymbol,
    timeframe,
    candles,
    livePrice: price ?? undefined,
    analysis,
    macroCandles,
    triggerCandles,
    fundingRate: funding?.lastFundingRate,
    openInterestChangePercent: oiSnapshot?.changePercent,
    isTechnicalMode,
  });

  // --- CoinGecko metadata. ---
  const { data: metadata } = useCoinMetadata(coingeckoId);

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
      <div className="space-y-6">
        <CoinHeader
          coinName={coinName}
          coinSymbol={coinSymbol}
          logoUrl={metadata?.logoUrl}
          price={price}
          change={change}
          isUp={isUp}
          isDown={isDown}
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

        {/* Market Stats */}
        <MarketStats symbol={coinSymbol} metadata={metadata ?? undefined} />

        <CoinAnalysisSection
          chartMode={chartMode}
          candles={candles}
          symbol={coinSymbol}
          timeframe={timeframe}
          price={price}
          analysis={analysis}
          futuresSignal={futuresSignal}
          activeIndicators={activeIndicators}
          onSwitchToTechnical={() => setChartMode('technical')}
        />
      </div>
    </AppShell>
  );
}

// ---------------------------------------------------------------------------
// MarketStats — kept in the page file because it's trivial + page-specific.
// ---------------------------------------------------------------------------

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="card px-4 py-3">
      <p className="text-xs font-medium uppercase tracking-wider text-text-muted">{label}</p>
      <p className="numeric mt-1 text-lg font-bold text-text-primary">{value}</p>
    </div>
  );
}

/**
 * Market stats section — fetches 24hr ticker from Binance Futures as fallback
 * when CoinGecko metadata is unavailable (non-registry coins).
 */
function MarketStats({ symbol, metadata }: { symbol: string; metadata?: { marketCap?: number; volume24h?: number; high24h?: number; low24h?: number } }) {
  const binanceSymbol = resolveBinanceSymbol(symbol);

  const { data: ticker24hr } = useQuery({
    queryKey: ['futures-ticker-24hr', binanceSymbol],
    queryFn: () => fetchSingleTicker24hr(binanceSymbol),
    staleTime: 60 * 1000,
    refetchInterval: 60 * 1000,
  });

  const volume24h = metadata?.volume24h ?? (ticker24hr ? parseFloat(ticker24hr.quoteVolume) : undefined);
  const high24h = metadata?.high24h ?? (ticker24hr ? parseFloat(ticker24hr.highPrice) : undefined);
  const low24h = metadata?.low24h ?? (ticker24hr ? parseFloat(ticker24hr.lowPrice) : undefined);
  const marketCap = metadata?.marketCap;

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <StatCard label="Market Cap" value={marketCap ? formatCompactNumber(marketCap) : '—'} />
      <StatCard label="24h Volume" value={volume24h ? formatCompactNumber(volume24h) : '—'} />
      <StatCard label="24h High" value={high24h ? formatCurrency(high24h) : '—'} />
      <StatCard label="24h Low" value={low24h ? formatCurrency(low24h) : '—'} />
    </div>
  );
}
