'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { AlertTriangle, RotateCw } from 'lucide-react';

/**
 * Global error boundary — catches render/data errors below the root layout.
 * Kept free of the app shell so it still renders if the shell itself is the
 * thing that failed. Offers recovery (retry) and an escape route (dashboard).
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[app] unhandled error:', error);
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div
        role="alert"
        className="card w-full max-w-md p-6 text-center"
      >
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-danger/10 text-danger">
          <AlertTriangle className="h-6 w-6" aria-hidden="true" />
        </span>
        <h1 className="mt-4 text-lg font-semibold text-text-primary">Something went wrong</h1>
        <p className="mt-2 text-sm text-text-secondary">
          An unexpected error interrupted this page. Retrying usually clears it; if it keeps
          happening, the underlying data source may be unavailable.
        </p>
        {error.digest && (
          <p className="mt-3 font-[family-name:var(--font-display)] text-xs text-text-muted">
            Reference: {error.digest}
          </p>
        )}
        <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
          <button
            type="button"
            onClick={reset}
            className="pressable inline-flex items-center gap-2 rounded-lg bg-accent-primary px-4 py-2 text-sm font-medium text-bg-app transition-colors hover:bg-accent-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
          >
            <RotateCw className="h-4 w-4" aria-hidden="true" />
            Try again
          </button>
          <Link
            href="/"
            className="pressable inline-flex items-center gap-2 rounded-lg bg-bg-surface-raised px-4 py-2 text-sm font-medium text-text-secondary transition-colors hover:bg-bg-surface-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
          >
            Go to dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
