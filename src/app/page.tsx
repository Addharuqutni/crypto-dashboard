import { AppShell } from '@/components/layout/app-shell';
import { DashboardClient } from '@/components/dashboard/dashboard-client';

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
