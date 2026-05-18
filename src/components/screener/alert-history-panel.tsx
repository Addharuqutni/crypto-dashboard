'use client';

import { CheckCircle2, Clock, XCircle, MinusCircle } from 'lucide-react';
import type { ScreenerAlertRecord } from '@/lib/screener/types';
import { cn } from '@/lib/utils';

interface AlertHistoryPanelProps {
  alerts: ScreenerAlertRecord[];
  isLoading: boolean;
}

/**
 * Alert history panel showing sent/skipped/disabled/failed decisions from
 * the append-only alerts log. This makes duplicate suppression and policy
 * decisions auditable from the UI.
 */
export function AlertHistoryPanel({ alerts, isLoading }: AlertHistoryPanelProps) {
  if (isLoading && alerts.length === 0) return <AlertHistorySkeleton />;

  const ordered = [...alerts].reverse().slice(0, 20);

  return (
    <section className="card overflow-hidden">
      <div className="border-b border-border-subtle px-5 py-3 lg:px-6">
        <h2 className="font-[family-name:var(--font-display)] text-sm font-semibold uppercase tracking-wider text-text-muted">
          Alert History
        </h2>
      </div>

      {ordered.length === 0 ? (
        <div className="p-5 text-sm text-text-secondary">
          No alert policy decisions recorded yet. Run the screener to populate alert history.
        </div>
      ) : (
        <div className="divide-y divide-border-subtle/50">
          {ordered.map((alert, idx) => (
            <AlertRow key={`${alert.symbol}-${alert.createdAt}-${idx}`} alert={alert} />
          ))}
        </div>
      )}
    </section>
  );
}

function AlertRow({ alert }: { alert: ScreenerAlertRecord }) {
  const Icon =
    alert.status === 'sent' ? CheckCircle2 :
    alert.status === 'failed' ? XCircle :
    alert.status === 'disabled' ? MinusCircle : Clock;

  const tone =
    alert.status === 'sent' ? 'text-success' :
    alert.status === 'failed' ? 'text-danger' :
    alert.status === 'disabled' ? 'text-text-muted' : 'text-warning';

  return (
    <div className="flex flex-col gap-2 px-5 py-3 sm:flex-row sm:items-center sm:justify-between lg:px-6">
      <div className="flex items-center gap-3">
        <Icon className={cn('h-4 w-4 shrink-0', tone)} />
        <div>
          <div className="flex items-center gap-2">
            <span className="font-semibold text-text-primary">{alert.symbol}</span>
            <span className={cn(
              'rounded px-1.5 py-0.5 text-[10px] font-bold uppercase',
              alert.action === 'LONG' && 'bg-market-up/10 text-market-up',
              alert.action === 'SHORT' && 'bg-market-down/10 text-market-down',
              alert.action === 'WAIT' && 'bg-market-neutral/10 text-market-neutral'
            )}>
              {alert.action}
            </span>
            <span className="text-xs text-text-muted">Grade {alert.grade}</span>
          </div>
          <div className="mt-0.5 text-xs text-text-secondary">
            {alert.status} · {formatReason(alert.reason)} · conf {alert.confidence}% · score {alert.rankingScore.toFixed(1)}
          </div>
        </div>
      </div>
      <time className="text-xs text-text-muted tabular-nums" dateTime={new Date(alert.createdAt).toISOString()}>
        {new Date(alert.createdAt).toLocaleString()}
      </time>
    </div>
  );
}

function AlertHistorySkeleton() {
  return (
    <section className="card overflow-hidden">
      <div className="border-b border-border-subtle px-5 py-3">
        <div className="skeleton h-4 w-28" />
      </div>
      <div className="divide-y divide-border-subtle/50">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="px-5 py-3">
            <div className="skeleton mb-2 h-4 w-36" />
            <div className="skeleton h-3 w-64" />
          </div>
        ))}
      </div>
    </section>
  );
}

function formatReason(reason: string): string {
  return reason.replace(/_/g, ' ');
}
