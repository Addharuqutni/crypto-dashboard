'use client';

import { AppHeader } from './app-header';
import { MarketPulseStrip } from './market-pulse-strip';

/**
 * App shell — wraps all pages with consistent header and pulse strip.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <>
      <AppHeader />
      <MarketPulseStrip />
      <main className="container-app flex-1 py-8">
        {children}
      </main>
    </>
  );
}
