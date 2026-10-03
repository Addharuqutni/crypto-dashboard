import type { Metadata } from 'next';
import Link from 'next/link';
import { Compass } from 'lucide-react';
import { AppShell } from '@/components/layout/app-shell';
import { EmptyState } from '@/components/ui/empty-state';

export const metadata: Metadata = {
  title: 'Page not found · CryptoHawk',
};

/**
 * Global 404 — shown for unmatched routes and `notFound()` calls.
 * Keeps the app shell so navigation stays available instead of dead-ending
 * the user on the framework's default page.
 */
export default function NotFound() {
  return (
    <AppShell>
      <EmptyState
        icon={Compass}
        title="This page could not be found"
        description="The page you are looking for may have been moved, renamed, or never existed. Try the dashboard or check the market pages."
      >
        <div className="flex flex-wrap items-center justify-center gap-2">
          <Link
            href="/"
            className="pressable inline-flex items-center gap-2 rounded-lg bg-accent-primary px-4 py-2 text-sm font-medium text-bg-app transition-colors hover:bg-accent-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
          >
            Go to dashboard
          </Link>
          <Link
            href="/screener"
            className="pressable inline-flex items-center gap-2 rounded-lg bg-bg-surface-raised px-4 py-2 text-sm font-medium text-text-secondary transition-colors hover:bg-bg-surface-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
          >
            Open screener
          </Link>
        </div>
      </EmptyState>
    </AppShell>
  );
}
