'use client';

import { useBinanceWebSocket } from '@/lib/adapters/websocket/use-binance-websocket';
import { useAlertEvaluator } from '@/lib/application/alerts/use-alert-evaluator';
import { useWatchlistStore } from '@/stores/use-watchlist-store';
import { useThemeStore } from '@/stores/use-theme-store';
import { usePortfolioStore } from '@/stores/use-portfolio-store';
import { useAlertStore } from '@/stores/use-alert-store';
import { useSignalJournalStore } from '@/stores/use-signal-journal-store';
import { useEffect } from 'react';

/**
 * Data provider — initializes WebSocket connection, hydrates all local stores,
 * and runs the alert evaluator.
 * Must be placed inside QueryProvider and rendered once at app level.
 */
export function DataProvider({ children }: { children: React.ReactNode }) {
  const hydrateWatchlist = useWatchlistStore((s) => s.hydrate);
  const hydrateTheme = useThemeStore((s) => s.hydrate);
  const hydratePortfolio = usePortfolioStore((s) => s.hydrate);
  const hydrateAlerts = useAlertStore((s) => s.hydrate);
  const hydrateSignalJournal = useSignalJournalStore((s) => s.hydrate);

  // Hydrate all stores from localStorage
  useEffect(() => {
    hydrateWatchlist();
    hydrateTheme();
    hydratePortfolio();
    hydrateAlerts();
    hydrateSignalJournal();
  }, [hydrateWatchlist, hydrateTheme, hydratePortfolio, hydrateAlerts, hydrateSignalJournal]);

  // Initialize WebSocket connection
  useBinanceWebSocket();

  // Run alert evaluator against live prices
  useAlertEvaluator();

  return <>{children}</>;
}
