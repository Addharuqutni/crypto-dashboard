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
      <main className="mx-auto w-full max-w-[1440px] flex-1 px-4 py-6 lg:px-6">
        {children}
      </main>
    </>
  );
}
