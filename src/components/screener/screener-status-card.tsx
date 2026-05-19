'use client';

import { Activity, AlertTriangle, CheckCircle2, Clock, Loader2 } from 'lucide-react';
import type { ScreenerLatestRun } from '@/lib/application/screener/store';
import { cn } from '@/lib/shared/utils';

interface ScreenerStatusCardProps {
  latest: ScreenerLatestRun | null;
  isLoading: boolean;
}

/**
 * Top status card for the screener page. Shows last run timestamp, health,
 * timeframes, and universe size. WAIT-only runs are still presented as
 * healthy because WAIT is valid analysis.
 */
export function ScreenerStatusCard({ latest, isLoading }: ScreenerStatusCardProps) {
  if (isLoading && !latest) {
    return <StatusSkeleton />;
  }

  if (!latest) {
    return <StatusEmpty />;
  }

  const lastRun = new Date(latest.completedAt);
  const lastRunStr = formatRelativeTime(latest.completedAt);
  const lastRunFull = lastRun.toLocaleString();

  const healthy = latest.health.status === 'completed';
  const partial = latest.health.status === 'completed_with_errors';
  const failed = latest.health.status === 'failed';

  return (
    <section className="card relative overflow-hidden p-5 lg:p-6">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {/* Last run */}
        <StatusItem
          icon={<Clock className="h-4 w-4" />}
          label="Last run"
          value={lastRunStr}
          subtext={lastRunFull}
        />

        {/* Health */}
        <StatusItem
          icon={
            failed ? (
              <AlertTriangle className="h-4 w-4 text-danger" />
            ) : partial ? (
              <AlertTriangle className="h-4 w-4 text-warning" />
            ) : (
              <CheckCircle2 className="h-4 w-4 text-success" />
            )
          }
          label="Health"
          value={
            failed
              ? 'Failed'
              : partial
                ? `${latest.health.evaluatedSymbols}/${latest.universeSize} ok`
                : `${latest.health.evaluatedSymbols}/${latest.universeSize} ok`
          }
          subtext={
            latest.health.failedSymbols > 0
              ? `${latest.health.failedSymbols} fetch error${latest.health.failedSymbols === 1 ? '' : 's'}`
              : 'All symbols evaluated'
          }
          tone={healthy ? 'success' : partial ? 'warning' : 'danger'}
        />

        {/* Timeframes */}
        <StatusItem
          icon={<Activity className="h-4 w-4" />}
          label="Timeframes"
          value={`${latest.timeframes.setup} / ${latest.timeframes.trigger}`}
          subtext={`Macro ${latest.timeframes.macro}`}
        />

        {/* Universe */}
        <StatusItem
          icon={<Activity className="h-4 w-4" />}
          label="Universe"
          value={`${latest.universeSize} symbols`}
          subtext="Top 10 USDⓈ-M perpetuals"
        />
      </div>

      {/* Disclaimer */}
      <p className="mt-4 border-t border-border-subtle pt-3 text-xs text-text-muted">
        Educational decision-support only. Not financial advice. Signals are deterministic outputs
        from technical analysis, never guarantees of price movement.
      </p>
    </section>
  );
}

interface StatusItemProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  subtext: string;
  tone?: 'default' | 'success' | 'warning' | 'danger';
}

function StatusItem({ icon, label, value, subtext, tone = 'default' }: StatusItemProps) {
  const valueClass = cn(
    'text-base font-semibold tabular-nums',
    tone === 'success' && 'text-success',
    tone === 'warning' && 'text-warning',
    tone === 'danger' && 'text-danger',
    tone === 'default' && 'text-text-primary'
  );
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-1.5 text-xs uppercase tracking-wider text-text-muted">
        {icon}
        {label}
      </div>
      <div className={valueClass}>{value}</div>
      <div className="text-xs text-text-secondary">{subtext}</div>
    </div>
  );
}

function StatusSkeleton() {
  return (
    <section className="card p-5 lg:p-6">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex flex-col gap-2">
            <div className="skeleton h-3 w-20" />
            <div className="skeleton h-5 w-32" />
            <div className="skeleton h-3 w-24" />
          </div>
        ))}
      </div>
    </section>
  );
}

function StatusEmpty() {
  return (
    <section className="card p-6">
      <div className="flex items-start gap-3">
        <div className="rounded-full bg-bg-surface-raised p-2">
          <Loader2 className="h-5 w-5 animate-spin text-accent-primary" />
        </div>
        <div className="flex-1">
          <h3 className="text-sm font-semibold text-text-primary">No screener data yet</h3>
          <p className="mt-1 text-sm text-text-secondary">
            Run the screener worker to populate this dashboard.
          </p>
          <code className="mt-2 inline-block rounded-md bg-bg-app px-2 py-1 font-mono text-xs text-accent-primary">
            npm run screener -- --once
          </code>
        </div>
      </div>
    </section>
  );
}

/** Format a unix ms timestamp as a relative-time string. */
function formatRelativeTime(ts: number): string {
  const diff = Date.now() - ts;
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return 'Just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
