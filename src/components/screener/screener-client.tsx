'use client';

import { AlertCircle } from 'lucide-react';
import { useScreenerData } from '@/hooks/use-screener-data';
import { ScreenerStatusCard } from './screener-status-card';
import { TopSetupsPanel } from './top-setups-panel';
import { ScreenerTable } from './screener-table';
import { AlertRulesPanel } from './alert-rules-panel';
import { AlertHistoryPanel } from './alert-history-panel';

/**
 * Screener client — orchestrates data fetching and component composition.
 * All sections handle their own empty/loading/error states. The page never
 * recomputes signals; it only displays what the worker persisted.
 */
export function ScreenerClient() {
  const { data, isLoading, error } = useScreenerData();

  if (error) {
    return (
      <div className="card flex items-start gap-3 p-5">
        <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-danger" />
        <div>
          <h3 className="text-sm font-semibold text-text-primary">Failed to load screener data</h3>
          <p className="mt-1 text-sm text-text-secondary">
            {error instanceof Error ? error.message : 'Unknown error fetching /api/screener.'}
          </p>
        </div>
      </div>
    );
  }

  const latest = data?.latest ?? null;
  const settings = data?.settings ?? null;
  const recentAlerts = data?.recentAlerts ?? [];
  const results = latest?.results ?? [];

  return (
    <div className="space-y-6 animate-slide-up">
      {/* Page header */}
      <header className="flex flex-col gap-1">
        <h1 className="font-[family-name:var(--font-display)] text-2xl font-bold tracking-tight text-text-primary lg:text-3xl">
          Futures Screener
        </h1>
        <p className="text-sm text-text-secondary">
          Risk-first deterministic screening of top USDⓈ-M perpetuals. WAIT is a valid decision.
        </p>
      </header>

      {/* Status */}
      <ScreenerStatusCard latest={latest} isLoading={isLoading} />

      {/* Top setups + alert rules */}
      <div className="grid gap-6 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <TopSetupsPanel
            results={results}
            isLoading={isLoading}
            audits={latest?.audits ?? {}}
          />
        </div>
        <div>
          <AlertRulesPanel settings={settings} isLoading={isLoading} />
        </div>
      </div>

      {/* Full table */}
      <ScreenerTable results={results} isLoading={isLoading} />

      {/* Alert history */}
      <AlertHistoryPanel alerts={recentAlerts} isLoading={isLoading} />
    </div>
  );
}
