'use client';

import { useBinanceWebSocket } from '@/hooks/use-binance-websocket';
import { useAlertEvaluator } from '@/hooks/use-alert-evaluator';
import { useWatchlistStore } from '@/stores/use-watchlist-store';
import { usePortfolioStore } from '@/stores/use-portfolio-store';
import { useAlertStore } from '@/stores/use-alert-store';
import { useSignalJournalStore } from '@/stores/use-signal-journal-store';
import { useAiStore } from '@/stores/use-ai-store';
import { usePathname } from 'next/navigation';
import { useEffect } from 'react';

/**
 * Data provider — hydrates local stores and enables live market services only
 * on routes that need them. This keeps non-market routes from opening the
 * expensive all-market Binance WebSocket and REST snapshot loop.
 */
export function DataProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const hydrateWatchlist = useWatchlistStore((s) => s.hydrate);
  const hydratePortfolio = usePortfolioStore((s) => s.hydrate);
  const hydrateAlerts = useAlertStore((s) => s.hydrate);
  const hydrateSignalJournal = useSignalJournalStore((s) => s.hydrate);
  const hydrateServerAiConfig = useAiStore((s) => s.hydrateServerConfig);

  useEffect(() => {
    hydrateWatchlist();
    hydratePortfolio();
    hydrateAlerts();
    hydrateSignalJournal();
    void hydrateServerAiConfig();
  }, [
    hydrateWatchlist,
    hydratePortfolio,
    hydrateAlerts,
    hydrateSignalJournal,
    hydrateServerAiConfig,
  ]);

  const marketStreamEnabled = shouldEnableMarketStream(pathname);

  useBinanceWebSocket(marketStreamEnabled);
  useAlertEvaluator();

  return <>{children}</>;
}

function shouldEnableMarketStream(pathname: string | null): boolean {
  if (!pathname) return true;
  return (
    pathname === '/' ||
    pathname.startsWith('/coin/') ||
    pathname.startsWith('/watchlist') ||
    pathname.startsWith('/portfolio') ||
    pathname.startsWith('/alerts')
  );
}
