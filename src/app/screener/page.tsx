import type { Metadata } from 'next';
import { AppShell } from '@/components/layout/app-shell';
import { ScreenerClient } from '@/components/screener/screener-client';

export const metadata: Metadata = {
  title: 'Futures Screener · CryptoHar',
  description:
    'Risk-first deterministic futures screener for top USDⓈ-M perpetuals. View ranked LONG/SHORT/WAIT decisions, alert rules, and policy history.',
};

/**
 * /screener — server route that streams the AppShell immediately and lets
 * the client hydrate the data-driven sections. The screener page reads
 * persisted worker output via /api/screener and never recomputes signals
 * client-side.
 */
export default function ScreenerPage() {
  return (
    <AppShell>
      <ScreenerClient />
    </AppShell>
  );
}
