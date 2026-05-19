'use client';

import { useEffect, useState } from 'react';
import { CheckCircle2, Clock, XCircle, MinusCircle, BellRing, TimerReset } from 'lucide-react';
import type { ScreenerAlertRecord, ScreenerAlertStatus } from '@/lib/application/screener/types';
import { cn } from '@/lib/shared/utils';

interface AlertHistoryPanelProps {
  alerts: ScreenerAlertRecord[];
  isLoading: boolean;
}

const ACTIVE_ALERT_WINDOW_MS = 4 * 60 * 60 * 1000;

/**
 * Local alert panel showing active triggered alerts, meaningful suppressed
 * alerts, and history. There is no Telegram or external delivery status here.
 */
export function AlertHistoryPanel({ alerts, isLoading }: AlertHistoryPanelProps) {
  // Hooks must be called unconditionally before any early return.
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  if (isLoading && alerts.length === 0) return <AlertHistorySkeleton />;

  const ordered = [...alerts].reverse();
  const active = alerts.filter(
    (a) => a.status === 'triggered' && now != null && now - a.createdAt < ACTIVE_ALERT_WINDOW_MS
  );
  const suppressed = ordered.filter((a) => a.status.startsWith('suppressed_')).slice(0, 5);
  const history = ordered.slice(0, 20);

  return (
    <section className="card overflow-hidden">
      <div className="border-b border-border-subtle px-5 py-4 lg:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-[family-name:var(--font-display)] text-sm font-semibold uppercase tracking-wider text-text-muted">
              Local Alerts
            </h2>
            <p className="mt-1 text-xs text-text-secondary">
              Dashboard-local alert lifecycle. History is source of truth; no external delivery.
            </p>
          </div>
          <div className="flex items-center gap-2 rounded-lg bg-bg-surface-soft px-3 py-1.5 text-xs">
            <BellRing className="h-3.5 w-3.5 text-accent-primary" />
            <span className="text-text-secondary">Active</span>
            <strong className="text-text-primary tabular-nums">{active.length}</strong>
          </div>
        </div>
      </div>

      <div className="grid gap-0 lg:grid-cols-[0.9fr_1.1fr]">
        {/* Active + suppressed summary */}
        <div className="border-b border-border-subtle p-5 lg:border-b-0 lg:border-r lg:px-6">
          <PanelBlock title="Active triggered alerts">
            {active.length === 0 ? (
              <EmptyLine text="No active local alerts. Risk state is neutral until a clean setup triggers." />
            ) : (
              <div className="space-y-2">
                {[...active].reverse().map((alert) => (
                  <AlertMiniCard key={`${alert.symbol}-${alert.createdAt}`} alert={alert} now={now} />
                ))}
              </div>
            )}
          </PanelBlock>

          <PanelBlock title="Recently suppressed" className="mt-5">
            {suppressed.length === 0 ? (
              <EmptyLine text="No meaningful suppressed alerts yet." />
            ) : (
              <div className="space-y-2">
                {suppressed.map((alert) => (
                  <AlertMiniCard key={`${alert.symbol}-${alert.createdAt}-${alert.status}`} alert={alert} now={now} compact />
                ))}
              </div>
            )}
          </PanelBlock>

          <div className="mt-5 rounded-lg border border-border-subtle bg-bg-surface-soft p-3 text-xs text-text-secondary">
            <div className="mb-1 flex items-center gap-1.5 font-semibold text-text-primary">
              <TimerReset className="h-3.5 w-3.5 text-accent-primary" />
              Lifecycle labels
            </div>
            Alerts expire if action changes to WAIT, candle data becomes too old, setup changes materially,
            or TTL elapses. TTL target: 2–4 hours. Automation can promote stale active alerts to
            <span className="font-semibold text-text-primary"> expired</span> in a follow-up job.
          </div>
        </div>

        {/* History */}
        <div className="p-5 lg:px-6">
          <PanelBlock title="Alert history">
            {history.length === 0 ? (
              <EmptyLine text="No local alert policy events recorded yet." />
            ) : (
              <div className="divide-y divide-border-subtle/50 rounded-lg border border-border-subtle">
                {history.map((alert, idx) => (
                  <AlertRow key={`${alert.symbol}-${alert.createdAt}-${idx}`} alert={alert} />
                ))}
              </div>
            )}
          </PanelBlock>
        </div>
      </div>
    </section>
  );
}

function PanelBlock({ title, children, className }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-text-muted">{title}</h3>
      {children}
    </div>
  );
}

function EmptyLine({ text }: { text: string }) {
  return <p className="rounded-lg bg-bg-surface-soft p-3 text-sm text-text-secondary">{text}</p>;
}

function AlertMiniCard({ alert, compact = false, now }: { alert: ScreenerAlertRecord; compact?: boolean; now: number | null }) {
  return (
    <div className="rounded-lg border border-border-subtle bg-bg-surface-soft p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <StatusIcon status={alert.status} />
          <span className="font-semibold text-text-primary">{alert.symbol}</span>
          <ActionLabel action={alert.action} />
        </div>
        <span className="text-xs text-text-muted tabular-nums">{formatRelative(alert.createdAt, now)}</span>
      </div>
      {!compact && (
        <p className="mt-1 text-xs text-text-secondary">
          {statusLabel(alert.status)} · {formatReason(alert.reason)} · conf {alert.confidence}%
        </p>
      )}
    </div>
  );
}

function AlertRow({ alert }: { alert: ScreenerAlertRecord }) {
  return (
    <div className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-3">
        <StatusIcon status={alert.status} />
        <div>
          <div className="flex items-center gap-2">
            <span className="font-semibold text-text-primary">{alert.symbol}</span>
            <ActionLabel action={alert.action} />
            <span className="text-xs text-text-muted">Grade {alert.grade}</span>
          </div>
          <div className="mt-0.5 text-xs text-text-secondary">
            {statusLabel(alert.status)} · {formatReason(alert.reason)} · conf {alert.confidence}% · score {alert.rankingScore.toFixed(1)}
          </div>
        </div>
      </div>
      <time className="text-xs text-text-muted tabular-nums" dateTime={new Date(alert.createdAt).toISOString()}>
        {new Date(alert.createdAt).toLocaleString()}
      </time>
    </div>
  );
}

function StatusIcon({ status }: { status: ScreenerAlertStatus }) {
  const Icon =
    status === 'triggered' ? CheckCircle2 :
    status === 'expired' ? XCircle :
    status === 'skipped' ? MinusCircle : Clock;

  const tone =
    status === 'triggered' ? 'text-success' :
    status === 'expired' ? 'text-danger' :
    status === 'skipped' ? 'text-text-muted' : 'text-warning';

  return <Icon className={cn('h-4 w-4 shrink-0', tone)} />;
}

function ActionLabel({ action }: { action: string }) {
  return (
    <span className={cn(
      'rounded px-1.5 py-0.5 text-[10px] font-bold uppercase',
      action === 'LONG' && 'bg-market-up/10 text-market-up',
      action === 'SHORT' && 'bg-market-down/10 text-market-down',
      action === 'WAIT' && 'bg-market-neutral/10 text-market-neutral'
    )}>
      {action}
    </span>
  );
}

function statusLabel(status: ScreenerAlertStatus): string {
  switch (status) {
    case 'triggered': return 'Triggered';
    case 'skipped': return 'Skipped';
    case 'suppressed_cooldown': return 'Suppressed: cooldown';
    case 'suppressed_hourly_cap': return 'Suppressed: hourly cap';
    case 'suppressed_low_quality': return 'Suppressed: low quality';
    case 'expired': return 'Expired';
  }
}

function AlertHistorySkeleton() {
  return (
    <section className="card overflow-hidden">
      <div className="border-b border-border-subtle px-5 py-3">
        <div className="skeleton h-4 w-28" />
      </div>
      <div className="grid gap-0 lg:grid-cols-2">
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="p-5">
            <div className="skeleton mb-3 h-4 w-36" />
            <div className="space-y-2">
              <div className="skeleton h-12 w-full" />
              <div className="skeleton h-12 w-full" />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function formatReason(reason: string): string {
  return reason.replace(/_/g, ' ');
}

/** Format a unix ms timestamp as relative time for alert age labels. */
function formatRelative(ts: number, now: number | null): string {
  if (now == null) return '';
  const diff = now - ts;
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return 'now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}
