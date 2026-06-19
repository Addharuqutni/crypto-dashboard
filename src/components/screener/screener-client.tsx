'use client';

import { useState, useMemo } from 'react';
import { AlertCircle, Bell } from 'lucide-react';
import { useScreenerData } from '@/hooks/use-screener-data';
import { useScreenerFilters } from '@/hooks/use-screener-filters';
import { useLocalAlertNotifications } from '@/hooks/use-local-alert-notifications';
import { ScreenerStatusCard } from './screener-status-card';
import { TopSetupsPanel } from './top-setups-panel';
import { ScreenerTable } from './screener-table';
import { ScreenerFilterBar } from './screener-filter-bar';
import { ScreenerDetailDrawer } from './screener-detail-drawer';
import { AlertRulesPanel } from './alert-rules-panel';
import { AlertHistoryPanel } from './alert-history-panel';
import { AlertSummaryBadge } from './alert-summary-badge';
import { RiskProfilePicker } from '@/components/intelligence/risk-profile-picker';
import { useRiskProfileStore } from '@/stores/use-risk-profile-store';
import type { RankedScreenerResult } from '@/lib/application/screener/types';

/**
 * Screener client — orchestrates data fetching, filtering, sorting, detail
 * drawer, and local alert display. The page never recomputes signals; it
 * only displays what the worker persisted.
 */
export function ScreenerClient() {
  const { data, isLoading, error } = useScreenerData();
  const riskProfile = useRiskProfileStore((s) => s.getProfile());
  const [selectedResult, setSelectedResult] = useState<RankedScreenerResult | null>(null);

  const latest = data?.latest ?? null;
  const settings = data?.settings ?? null;
  const recentAlerts = useMemo(() => data?.recentAlerts ?? [], [data?.recentAlerts]);
  // recentActionCalls and recentJournalEntries available via data?.recentActionCalls / data?.recentJournalEntries
  const results = useMemo(() => latest?.results ?? [], [latest?.results]);

  const {
    filters,
    sort,
    filtered,
    totalCount,
    filteredCount,
    activeFilterCount,
    updateFilter,
    toggleSort,
    resetFilters,
  } = useScreenerFilters(results, riskProfile);

  // Browser notifications for triggered alerts (optional, safe).
  const triggeredAlerts = useMemo(
    () => recentAlerts.filter((a) => a.status === 'triggered'),
    [recentAlerts]
  );
  const { permission, requestPermission } = useLocalAlertNotifications(triggeredAlerts);

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

  return (
    <div className="space-y-6 animate-slide-up">
      {/* Page header */}
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="font-[family-name:var(--font-display)] text-2xl font-bold tracking-tight text-text-primary lg:text-3xl">
            Futures Screener
          </h1>
          <p className="mt-1 text-sm text-text-secondary">
            Risk-first deterministic screening of top USDⓈ-M perpetuals. WAIT is a valid decision.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <RiskProfilePicker />
          <AlertSummaryBadge
            alerts={recentAlerts}
            alertsEnabled={settings?.enabled ?? false}
            lastRunAt={latest?.completedAt ?? null}
          />
          {permission !== 'granted' && permission !== 'unsupported' && (
            <button
              onClick={() => void requestPermission()}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border-subtle bg-bg-surface-soft px-3 py-1.5 text-xs text-text-secondary transition-colors hover:bg-bg-surface-raised hover:text-text-primary"
              aria-label="Enable browser notifications for local alerts"
            >
              <Bell className="h-3.5 w-3.5" />
              Enable notifications
            </button>
          )}
        </div>
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

      {/* Filters */}
      <ScreenerFilterBar
        filters={filters}
        totalCount={totalCount}
        filteredCount={filteredCount}
        activeFilterCount={activeFilterCount}
        onFilterChange={updateFilter}
        onReset={resetFilters}
      />

      {/* Full table with sorting */}
      <ScreenerTable
        results={filtered}
        isLoading={isLoading}
        sort={sort}
        onSort={toggleSort}
        onRowClick={setSelectedResult}
      />

      {/* Local alert panel */}
      <AlertHistoryPanel alerts={recentAlerts} isLoading={isLoading} />

      {/* Disclaimer */}
      <footer className="rounded-lg border border-border-subtle bg-bg-surface-soft p-4 text-xs text-text-muted">
        <strong className="text-text-secondary">Disclaimer:</strong> This is educational decision-support only, not financial advice.
        All signals are deterministic outputs from technical analysis. They are not predictions, profit signals, or guaranteed outcomes.
        WAIT is a valid risk-first decision. Always manage your own risk.
      </footer>

      {/* Detail drawer */}
      <ScreenerDetailDrawer
        result={selectedResult}
        audit={selectedResult ? (latest?.audits ?? {})[selectedResult.symbol] : undefined}
        onClose={() => setSelectedResult(null)}
      />
    </div>
  );
}
