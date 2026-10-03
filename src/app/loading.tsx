import { AppShell } from '@/components/layout/app-shell';

/**
 * Route-level loading UI — shown while a page's data resolves during
 * navigation. Mirrors the common "header + card list" shape so the transition
 * reads as the real page filling in rather than a spinner flash.
 */
export default function Loading() {
  return (
    <AppShell>
      <div className="space-y-6" aria-busy="true" aria-live="polite">
        <span className="sr-only">Loading page content</span>

        <div className="card p-5">
          <div className="skeleton h-7 w-40" />
          <div className="skeleton mt-3 h-4 w-64" />
        </div>

        <div className="card p-6">
          <div className="skeleton h-5 w-32" />
          <div className="mt-4 space-y-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="skeleton h-12" />
            ))}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
