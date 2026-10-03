import type { Metadata } from 'next';
import { AppShell } from '@/components/layout/app-shell';
import { DashboardClient } from '@/components/dashboard/dashboard-client';

export const metadata: Metadata = {
  title: 'Markets · CryptoHawk',
  description:
    'Real-time futures market overview: top coins, price action, and market pulse.',
};

/**
 * Dashboard Home — Server Component route.
 * Streams the AppShell immediately while DashboardClient hydrates as a
 * client boundary. This reduces time-to-first-paint because the shell
 * (header, nav, pulse strip) renders on the server without waiting for
 * client-side stores or queries.
 */
export default function DashboardPage() {
  return (
    <AppShell>
      <DashboardClient />
    </AppShell>
  );
}
