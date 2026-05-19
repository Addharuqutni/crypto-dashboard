'use client';

import { Bell, BellOff } from 'lucide-react';
import type { ScreenerAlertSettings } from '@/lib/application/screener/types';

interface AlertRulesPanelProps {
  settings: ScreenerAlertSettings | null;
  isLoading: boolean;
}

/**
 * Read-only alert rules panel. Settings are persisted server-side and surfaced
 * here for operator awareness; mutation can be added later via PATCH once auth
 * and safety controls exist.
 */
export function AlertRulesPanel({ settings, isLoading }: AlertRulesPanelProps) {
  if (isLoading && !settings) return <AlertRulesSkeleton />;
  if (!settings) return null;

  return (
    <section className="card p-5 lg:p-6">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="font-[family-name:var(--font-display)] text-sm font-semibold uppercase tracking-wider text-text-muted">
          Alert Rules
        </h2>
        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${settings.enabled ? 'bg-success/10 text-success' : 'bg-text-muted/10 text-text-muted'}`}>
          {settings.enabled ? <Bell className="h-3 w-3" /> : <BellOff className="h-3 w-3" />}
          {settings.enabled ? 'Enabled' : 'Disabled'}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3 lg:grid-cols-2 xl:grid-cols-3">
        <Rule label="Min confidence" value={`${settings.minConfidence}%`} />
        <Rule label="Min grade" value={settings.minGrade} />
        <Rule label="Min R:R" value={settings.minRiskReward.toFixed(1)} />
        <Rule label="Cooldown" value={`${settings.cooldownMinutes}m`} />
        <Rule label="Max/hour" value={String(settings.maxAlertsPerHour)} />
        <Rule label="WAIT alerts" value={settings.sendWaitAlerts ? 'On' : 'Off'} />
        <Rule label="Top N only" value={String(settings.topNOnly)} />
      </div>

      <p className="mt-4 rounded-lg bg-bg-surface-soft p-3 text-xs text-text-secondary">
        All alerts are local dashboard events only. Alerts are suppressed for stale data, insufficient
        data, duplicate symbol/action within cooldown, and hourly caps. No external delivery is configured.
      </p>
    </section>
  );
}

function Rule({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-bg-surface-soft p-3">
      <div className="text-xs text-text-muted">{label}</div>
      <div className="mt-1 font-semibold text-text-primary tabular-nums">{value}</div>
    </div>
  );
}

function AlertRulesSkeleton() {
  return (
    <section className="card p-5 lg:p-6">
      <div className="skeleton mb-4 h-4 w-24" />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="rounded-lg bg-bg-surface-soft p-3">
            <div className="skeleton mb-2 h-3 w-20" />
            <div className="skeleton h-5 w-12" />
          </div>
        ))}
      </div>
    </section>
  );
}
