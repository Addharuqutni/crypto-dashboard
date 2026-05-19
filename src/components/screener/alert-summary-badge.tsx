'use client';

import { useEffect, useState } from 'react';
import { Bell, BellOff, AlertOctagon } from 'lucide-react';
import type { ScreenerAlertRecord } from '@/lib/application/screener/types';
import { cn } from '@/lib/shared/utils';

interface AlertSummaryBadgeProps {
  alerts: ScreenerAlertRecord[];
  alertsEnabled: boolean;
  /** Unix ms timestamp of the latest screener run, for stale display. */
  lastRunAt: number | null;
}

/**
 * Compact local-alert summary badge. Shows active alert count and the most
 * recent triggered symbol. Used in the screener page header so the user can
 * see at a glance whether clean setups currently exist.
 *
 * "Active" means: triggered status with createdAt within the last
 * ACTIVE_ALERT_WINDOW_MS (default 4 hours, the upper bound of the alert TTL).
 */
const ACTIVE_ALERT_WINDOW_MS = 4 * 60 * 60 * 1000;

export function AlertSummaryBadge({ alerts, alertsEnabled, lastRunAt }: AlertSummaryBadgeProps) {
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    setNow(Date.now());
  }, []);

  const activeAlerts = alerts.filter(
    (a) => a.status === 'triggered' && now != null && now - a.createdAt < ACTIVE_ALERT_WINDOW_MS
  );
  const latest = activeAlerts.length > 0 ? activeAlerts[activeAlerts.length - 1]! : null;
  const activeCount = activeAlerts.length;

  if (!alertsEnabled) {
    return (
      <div className="inline-flex items-center gap-2 rounded-lg border border-border-subtle bg-bg-surface-soft px-3 py-1.5 text-xs">
        <BellOff className="h-3.5 w-3.5 text-text-muted" />
        <span className="text-text-secondary">Local alerts disabled</span>
      </div>
    );
  }

  if (activeCount === 0) {
    return (
      <div className="inline-flex items-center gap-2 rounded-lg border border-border-subtle bg-bg-surface-soft px-3 py-1.5 text-xs">
        <Bell className="h-3.5 w-3.5 text-text-muted" />
        <span className="text-text-secondary">No active local alerts</span>
        {lastRunAt && (
          <span className="border-l border-border-subtle pl-2 text-[10px] text-text-muted">
            Last run {formatRelative(lastRunAt, now ?? lastRunAt)}
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="inline-flex items-center gap-2 rounded-lg border border-success/30 bg-success/8 px-3 py-1.5 text-xs">
      <AlertOctagon className="h-3.5 w-3.5 text-success animate-soft-pulse" />
      <span className="font-semibold text-success">
        {activeCount} active local alert{activeCount === 1 ? '' : 's'}
      </span>
      {latest && (
        <span className="border-l border-success/30 pl-2 text-text-secondary">
          Latest: <strong className="text-text-primary">{latest.symbol}</strong>{' '}
          <span className={cn(
            'font-semibold',
            latest.action === 'LONG' && 'text-market-up',
            latest.action === 'SHORT' && 'text-market-down',
            latest.action === 'WAIT' && 'text-market-neutral'
          )}>
            {latest.action}
          </span>
        </span>
      )}
      {lastRunAt && (
        <span className="border-l border-success/30 pl-2 text-[10px] text-text-muted">
          {formatRelative(lastRunAt, now ?? lastRunAt)}
        </span>
      )}
    </div>
  );
}

/** Format a unix ms timestamp as a relative-time string. */
function formatRelative(ts: number, now: number): string {
  const diff = now - ts;
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
