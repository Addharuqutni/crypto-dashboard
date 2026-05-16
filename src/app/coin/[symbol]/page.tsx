'use client';

import { useState, useMemo } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { AppShell } from '@/components/layout/app-shell';
import { CandlestickChart } from '@/components/chart/candlestick-chart';
import { VisibilityGate } from '@/components/ui/visibility-gate';
import { TechnicalPanel } from '@/components/technical-analysis/technical-panel';
import { IndicatorToggles } from '@/components/technical-analysis/indicator-toggles';
import { FuturesSignalPanel } from '@/components/technical-analysis/futures-signal-panel';
import { AiChatPanel } from '@/components/ai-agent/ai-chat-panel';
import { useWatchlistStore } from '@/stores/use-watchlist-store';
import { useMarketStore } from '@/stores/use-market-store';
import { useCoinMetadata } from '@/lib/api/hooks';
import { getCoinBySymbol } from '@/lib/registry/coin-registry';
import { fetchKlineData } from '@/lib/api/binance-kline';
import { fetchSingleTicker24hr } from '@/lib/binance/binance-futures-client';
import { fetchFundingRate } from '@/lib/api/binance-funding-rate';
import { fetchOpenInterestSnapshot } from '@/lib/api/binance-open-interest';
import { useBinanceKlineWebSocket } from '@/lib/websocket/use-binance-kline-websocket';
import { resolveBinanceSymbol } from '@/lib/registry/coin-registry';
import { MTF_CASCADE } from '@/lib/analysis/mtf-cascade';
import { getRsiStatus, calculateMACD, calculateSupportResistance, calculateTrendLabel, calculateFibonacci, calculateOrderBlocks } from '@/lib/indicators';
import { formatCurrency, formatPercentage, formatCompactNumber } from '@/lib/formatting';
import { cn } from '@/lib/utils';
import { Star, TrendingUp, TrendingDown, Minus, ArrowLeft, RefreshCw, LineChart, BarChart3 } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import type { ChartTimeframe, AnalysisResult } from '@/types/chart';

type ChartMode = 'clean' | 'technical';

/**
 * Maximum number of candles fed into client-side technical indicator
 * calculations. Indicators only need the recent window for accurate
 * MA/RSI/MACD output, so bounding the input keeps the main thread fast
 * regardless of how much history Binance returns.
 */
const MAX_INDICATOR_CANDLES = 1000;

/**
 * Coin detail page — shows chart, market stats, watchlist action, and technical analysis.
 * Route: /coin/[symbol]
 * Supports Clean Mode (price only) and Technical Mode (indicators + analysis).
 */
export default function CoinDetailPage() {
  const params = useParams();
  const symbolParam = (params.symbol as string)?.toUpperCase() ?? '';

  const coin = getCoinBySymbol(symbolParam);
  const livePrice = useMarketStore((s) => s.prices[symbolParam]);
  const isInWatchlist = useWatchlistStore((s) => s.isInWatchlist(symbolParam));
  const addCoin = useWatchlistStore((s) => s.addCoin);
  const removeCoin = useWatchlistStore((s) => s.removeCoin);
  const hydrated = useWatchlistStore((s) => s.hydrated);

  /**
   * Derive coin display info from registry or live price.
   * Allows viewing any coin that has live data, even if not in static registry.
   */
  const coinName = coin?.name ?? symbolParam;
  const coinSymbol = coin?.symbol ?? symbolParam;
  const coingeckoId = coin?.coingeckoId;
  const hasCoin = !!(coin || livePrice);

  const [timeframe, setTimeframe] = useState<ChartTimeframe>('24H');
  const [chartMode, setChartMode] = useState<ChartMode>('clean');
  const [activeIndicators, setActiveIndicators] = useState<Set<string>>(
    new Set(['MA25', 'RSI', 'MACD', 'S/R', 'Fib', 'OB'])
  );

  // Fetch candle data (OHLCV) — used for both chart and technical analysis
  const {
    data: candles,
    isLoading: chartLoading,
    isError: chartError,
  } = useQuery({
    queryKey: ['candles-raw', symbolParam, timeframe],
    queryFn: () => fetchKlineData(symbolParam, timeframe),
    staleTime: 60 * 1000,
    refetchInterval: 60 * 1000,
    enabled: hasCoin,
  });

  // Subscribe to live kline ticks for the active timeframe.
  // The hook patches the same TanStack Query cache key in place, so the
  // candlestick chart's effect 2 detects only-last-bar mutation and calls
  // series.update() — no full redraw, no blink.
  useBinanceKlineWebSocket({
    symbol: symbolParam,
    timeframe,
    enabled: hasCoin,
  });

  // --- Multi-timeframe candle fetches for the futures signal engine. ---
  // Macro and trigger TFs are pulled lazily and only when in technical mode
  // so the clean/non-technical experience stays cheap.
  const macroTf = MTF_CASCADE[timeframe]?.macro;
  const triggerTf = MTF_CASCADE[timeframe]?.trigger;

  const { data: macroCandles } = useQuery({
    queryKey: ['candles-raw', symbolParam, macroTf ?? 'none', 'macro'],
    queryFn: () => (macroTf ? fetchKlineData(symbolParam, macroTf) : Promise.resolve([])),
    staleTime: 5 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
    enabled: hasCoin && chartMode === 'technical' && !!macroTf,
  });

  const { data: triggerCandles } = useQuery({
    queryKey: ['candles-raw', symbolParam, triggerTf ?? 'none', 'trigger'],
    queryFn: () => (triggerTf ? fetchKlineData(symbolParam, triggerTf) : Promise.resolve([])),
    staleTime: 60 * 1000,
    refetchInterval: 60 * 1000,
    enabled: hasCoin && chartMode === 'technical' && !!triggerTf,
  });

  // --- Futures positioning: funding rate + open interest. ---
  // Resolve the trading pair via the registry so non-USDT quote pairs (e.g.
  // future USDC perpetuals) stay correct without changing call sites.
  const binanceSymbol = resolveBinanceSymbol(coinSymbol);
  const { data: funding } = useQuery({
    queryKey: ['funding-rate', binanceSymbol],
    queryFn: () => fetchFundingRate(binanceSymbol),
    staleTime: 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
    enabled: hasCoin && chartMode === 'technical',
  });
  const { data: oiSnapshot } = useQuery({
    queryKey: ['open-interest', binanceSymbol],
    queryFn: () => fetchOpenInterestSnapshot(binanceSymbol, '1h'),
    staleTime: 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
    enabled: hasCoin && chartMode === 'technical',
  });

  // Fetch metadata from CoinGecko (only if registry coin has coingeckoId)
  const { data: metadata } = useCoinMetadata(coingeckoId);

  // --- Live price wiring (Binance USDⓈ-M Futures WebSocket). ---
  //
  // Two complementary Futures WS sources cooperate here:
  //   1. Per-symbol kline stream (`<sym>@kline_<interval>`) — patches the
  //      candles cache in place every ~250ms; the latest candle's close is
  //      the freshest live price for the active timeframe.
  //   2. Global all-market mini ticker (`!miniTicker@arr`) — populates the
  //      market store with 24h change % for every Futures USDT pair.
  //
  // Header prefers the kline-derived close for tightest update cadence and
  // falls back to the global stream while the kline cache warms up. 24h % is
  // sourced from the global stream because kline does not carry it directly.
  const klineLivePrice =
    candles && candles.length > 0 ? candles[candles.length - 1]!.close : null;
  const price = klineLivePrice ?? livePrice?.price;
  const change = livePrice?.priceChangePercent24h;
  const isUp = (change ?? 0) > 0;
  const isDown = (change ?? 0) < 0;

  // Convert candles to chart-ready OHLCV format — memoized to prevent chart blink
  const candleChartData = useMemo(() => {
    if (!candles || candles.length === 0) return [];
    return candles.map((c) => ({ time: c.openTime, open: c.open, high: c.high, low: c.low, close: c.close, volume: c.volume }));
  }, [candles]);

  // Pre-compute technical analysis only when in technical mode.
  // Avoids expensive indicator calculations on initial page load.
  // Candles are bounded so heavy TA work stays predictable on the main thread.
  const analysis: AnalysisResult | null = useMemo(() => {
    if (chartMode !== 'technical') return null;
    if (!candles || candles.length < 14) return null;

    const window =
      candles.length > MAX_INDICATOR_CANDLES
        ? candles.slice(-MAX_INDICATOR_CANDLES)
        : candles;

    const rsi = getRsiStatus(window);
    const macd = calculateMACD(window);
    const sr = calculateSupportResistance(window);
    const trend = calculateTrendLabel(window);
    const fib = calculateFibonacci(window);
    const orderBlocks = calculateOrderBlocks(window);
    const latestMacd = macd.length > 0 ? macd[macd.length - 1]! : null;

    return { rsi, macd: latestMacd, sr, trend, fib, orderBlocks };
  }, [chartMode, candles]);

  // Toggle indicator
  /**
   * Menjalankan logic handle toggle indicator.
   * Dipakai untuk memisahkan tanggung jawab fungsi ini dari bagian aplikasi lain.
   */
  const handleToggleIndicator = (key: string) => {
    setActiveIndicators((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  // Invalid coin — not in registry AND no live price data
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


  const timeframes: ChartTimeframe[] = ['5m', '15m', '30m', '1H', '4H', '24H', '7D', '30D'];

  return (
    <AppShell>
      <div className="space-y-6">
        {/* Back link */}
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-sm text-text-secondary transition-colors hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
        >
          <ArrowLeft className="h-4 w-4" />
          Dashboard
        </Link>

        {/* Coin Identity Header */}
        <div className="flex flex-wrap items-center gap-4">
          {metadata?.logoUrl ? (
            <img
              src={metadata.logoUrl}
              alt={`${coinName} logo`}
              className="h-12 w-12 rounded-full"
              width={48}
              height={48}
            />
          ) : (
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-bg-surface-raised text-lg font-bold text-accent-primary">
              {coinSymbol.slice(0, 2)}
            </span>
          )}

          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-[family-name:var(--font-display)] text-2xl font-bold text-text-primary">
                {coinName}
              </h1>
              <span className="rounded-md bg-bg-surface-raised px-2 py-0.5 text-xs font-medium text-text-muted">
                {coinSymbol}
              </span>
            </div>
            <div className="mt-1 flex items-center gap-3">
              {price != null ? (
                <span
                  className="numeric inline-flex items-baseline gap-2 text-3xl font-bold text-text-primary"
                  aria-live="polite"
                  aria-label={`Current price ${formatCurrency(price)}`}
                >
                  {formatCurrency(price)}
                </span>
              ) : (
                <span className="text-3xl font-bold text-text-muted">—</span>
              )}
              {change != null && (
                <span
                  className={cn(
                    'numeric inline-flex items-center gap-1 text-lg font-semibold',
                    isUp && 'text-market-up',
                    isDown && 'text-market-down',
                    !isUp && !isDown && 'text-market-neutral'
                  )}
                  aria-label={`${coinName} is ${isUp ? 'up' : isDown ? 'down' : 'unchanged'} ${formatPercentage(change)} in the last 24 hours`}
                >
                  {isUp && <TrendingUp className="h-5 w-5" />}
                  {isDown && <TrendingDown className="h-5 w-5" />}
                  {!isUp && !isDown && <Minus className="h-5 w-5" />}
                  {formatPercentage(change)}
                </span>
              )}
            </div>
          </div>

          {/* Watchlist Button */}
          {hydrated && (
            <button
              onClick={() => {
                if (isInWatchlist) removeCoin(coinSymbol);
                else addCoin(coinSymbol, coinName);
              }}
              className={cn(
                'ml-auto inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring',
                isInWatchlist
                  ? 'bg-accent-warm/10 text-accent-warm hover:bg-accent-warm/20'
                  : 'bg-bg-surface-raised text-text-secondary hover:bg-bg-surface-soft hover:text-text-primary'
              )}
              aria-label={isInWatchlist ? `Remove ${coinSymbol} from watchlist` : `Add ${coinSymbol} to watchlist`}
            >
              <Star className={cn('h-4 w-4', isInWatchlist && 'fill-current')} />
              {isInWatchlist ? 'In Watchlist' : 'Add to Watchlist'}
            </button>
          )}
        </div>

        {/* Chart Section */}
        <div className="card overflow-hidden">
          {/* Chart Controls */}
          <div className="flex flex-wrap items-center gap-2 border-b border-border-subtle px-4 py-2.5">
            {/* Timeframe buttons */}
            <div className="flex items-center gap-1">
              {timeframes.map((tf) => (
                <button
                  key={tf}
                  onClick={() => setTimeframe(tf)}
                  className={cn(
                    'rounded-md px-3 py-1.5 text-xs font-semibold transition-colors',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring',
                    timeframe === tf
                      ? 'bg-accent-primary/10 text-accent-primary'
                      : 'text-text-muted hover:bg-bg-surface-soft hover:text-text-secondary'
                  )}
                  aria-label={`Show ${tf} chart`}
                  aria-pressed={timeframe === tf}
                >
                  {tf}
                </button>
              ))}
            </div>

            {/* Status + Mode Toggle */}
            <div className="ml-auto flex items-center gap-2">
              {chartLoading && (
                <RefreshCw className="h-3.5 w-3.5 animate-spin text-text-muted" aria-label="Loading chart data" />
              )}
              {chartError && (
                <span
                  className="text-xs font-medium text-warning"
                  role="status"
                  aria-label="Chart data unavailable"
                >
                  Chart unavailable
                </span>
              )}

              {/* Clean / Technical Mode Toggle */}
              <div className="flex items-center gap-0.5 rounded-lg border border-border-subtle p-0.5">
                <button
                  onClick={() => setChartMode('clean')}
                  className={cn(
                    'flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring',
                    chartMode === 'clean'
                      ? 'bg-bg-surface-raised text-text-primary'
                      : 'text-text-muted hover:text-text-secondary'
                  )}
                  aria-pressed={chartMode === 'clean'}
                >
                  <LineChart className="h-3 w-3" />
                  Clean
                </button>
                <button
                  onClick={() => setChartMode('technical')}
                  className={cn(
                    'flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring',
                    chartMode === 'technical'
                      ? 'bg-accent-secondary/10 text-accent-secondary'
                      : 'text-text-muted hover:text-text-secondary'
                  )}
                  aria-pressed={chartMode === 'technical'}
                >
                  <BarChart3 className="h-3 w-3" />
                  Technical
                </button>
              </div>
            </div>
          </div>

          {/* Indicator Toggles — only in Technical Mode */}
          {chartMode === 'technical' && (
            <div className="border-b border-border-subtle/50 px-4 py-2">
              <IndicatorToggles active={activeIndicators} onToggle={handleToggleIndicator} />
            </div>
          )}

          {/* Chart */}
          <div className="p-4">
            <VisibilityGate fallback={<ChartDeferredSkeleton />}>
              <CandlestickChart
                data={candleChartData}
                candles={chartMode === 'technical' ? candles : undefined}
                activeIndicators={chartMode === 'technical' ? activeIndicators : undefined}
                symbol={coinSymbol}
                timeframe={timeframe}
              />
            </VisibilityGate>
          </div>
        </div>

        {/* Market Stats — uses CoinGecko when available, Futures 24hr ticker as fallback */}
        <MarketStats symbol={coinSymbol} metadata={metadata ?? undefined} />

        {/* Technical Analysis Panel — only in Technical Mode */}
        {chartMode === 'technical' && candles && candles.length > 0 && (
          <TechnicalPanel
            candles={candles}
            symbol={coinSymbol}
            timeframe={timeframe}
            currentPrice={price}
            activeIndicators={activeIndicators}
            analysis={analysis}
          />
        )}

        {/* Futures Setup — disciplined LONG/SHORT/WAIT decision engine */}
        {chartMode === 'technical' && candles && candles.length > 0 && (
          <FuturesSignalPanel
            candles={candles}
            symbol={coinSymbol}
            timeframe={timeframe}
            livePrice={price}
            rsi={analysis?.rsi}
            macd={analysis?.macd ?? null}
            supportResistance={analysis?.sr}
            macroCandles={macroCandles && macroCandles.length > 0 ? macroCandles : undefined}
            triggerCandles={triggerCandles && triggerCandles.length > 0 ? triggerCandles : undefined}
            fundingRate={funding?.lastFundingRate ?? null}
            openInterestChangePercent={oiSnapshot?.changePercent ?? null}
          />
        )}

        {/* AI Technical Advisor — only in Technical Mode */}
        {chartMode === 'technical' && (
          <AiChatPanel
            symbol={coinSymbol}
            timeframe={timeframe}
            currentPrice={price}
            analysis={analysis}
          />
        )}

        {/* Technical Mode CTA when in Clean Mode */}
        {chartMode === 'clean' && (
          <div className="card flex items-center justify-between px-4 py-4">
            <div>
              <p className="text-sm font-medium text-text-secondary">Technical Analysis</p>
              <p className="mt-0.5 text-xs text-text-muted">
                Switch to Technical Mode for RSI, MACD, MA, and Support/Resistance.
              </p>
            </div>
            <button
              onClick={() => setChartMode('technical')}
              className="inline-flex items-center gap-1.5 rounded-lg bg-accent-secondary/10 px-3 py-1.5 text-xs font-medium text-accent-secondary transition-colors hover:bg-accent-secondary/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
            >
              <BarChart3 className="h-3.5 w-3.5" />
              Enable
            </button>
          </div>
        )}
      </div>
    </AppShell>
  );
}

/**

 * Komponen ChartDeferredSkeleton untuk merender bagian UI terkait chart deferred skeleton.

 * Menjaga struktur tampilan tetap terpisah dari halaman atau komponen induk.

 */

function ChartDeferredSkeleton() {
  return (
    <div className="flex h-[420px] items-center justify-center rounded-xl border border-border-subtle/60 bg-bg-surface-soft/40">
      <div className="text-center">
        <div className="mx-auto h-8 w-8 animate-pulse rounded-full bg-bg-surface-raised" />
        <p className="mt-3 text-xs font-medium uppercase tracking-wider text-text-muted">
          Preparing chart
        </p>
      </div>
    </div>
  );
}

/**

 * Komponen StatCard untuk merender bagian UI terkait stat card.

 * Menjaga struktur tampilan tetap terpisah dari halaman atau komponen induk.

 */

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
 * Displays: Market Cap, 24h Volume, 24h High, 24h Low.
 */
function MarketStats({ symbol, metadata }: { symbol: string; metadata?: { marketCap?: number; volume24h?: number; high24h?: number; low24h?: number } }) {
  // Use registry resolver so non-USDT pairs stay correct.
  const binanceSymbol = resolveBinanceSymbol(symbol);

  // Fetch Futures 24hr ticker as fallback for non-registry coins
  const { data: ticker24hr } = useQuery({
    queryKey: ['futures-ticker-24hr', binanceSymbol],
    queryFn: () => fetchSingleTicker24hr(binanceSymbol),
    staleTime: 60 * 1000,
    refetchInterval: 60 * 1000,
  });

  // Merge: CoinGecko takes priority, Futures ticker as fallback
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

