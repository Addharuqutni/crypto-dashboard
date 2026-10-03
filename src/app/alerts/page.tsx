'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AppShell } from '@/components/layout/app-shell';
import { EmptyState } from '@/components/ui/empty-state';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useAlertStore } from '@/stores/use-alert-store';
import { useMarketStore } from '@/stores/use-market-store';
import { getCoinBySymbol } from '@/lib/shared/registry/coin-registry';
import { formatCurrency } from '@/lib/shared/formatting';
import { cn } from '@/lib/shared/utils';
import { Bell, BellOff, Plus, Trash2, X, AlertTriangle, CheckCircle2 } from 'lucide-react';
import type { PriceAlert } from '@/types/alert';

/**
 * Alerts page — create and manage price alerts with browser notifications.
 */
export default function AlertsPage() {
  const alerts = useAlertStore((s) => s.alerts);
  const hydrated = useAlertStore((s) => s.hydrated);
  const hydrate = useAlertStore((s) => s.hydrate);
  const addAlert = useAlertStore((s) => s.addAlert);
  const removeAlert = useAlertStore((s) => s.removeAlert);
  const connectionStatus = useMarketStore((s) => s.connectionStatus);

  const [showForm, setShowForm] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<PriceAlert | null>(null);
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission | 'unsupported'>('default');

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  // Check notification permission
  useEffect(() => {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      setNotificationPermission('unsupported');
      return;
    }
    setNotificationPermission(Notification.permission);
  }, []);

  const requestPermission = async () => {
    if (!('Notification' in window)) return;
    const result = await Notification.requestPermission();
    setNotificationPermission(result);
  };

  const activeAlerts = alerts.filter((a) => a.status === 'active');
  const triggeredAlerts = alerts.filter((a) => a.status === 'triggered');

  if (!hydrated) {
    return (
      <AppShell>
        <div className="card p-6">
          <div className="skeleton h-6 w-32" />
          <div className="mt-4 space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="skeleton h-14" />
            ))}
          </div>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="space-y-6">
        {/* Page Header */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="h1">
              Price Alerts
            </h1>
            <p className="mt-1 text-sm text-text-secondary">
              Get notified when prices hit your targets. Alerts work while browser is active.
            </p>
          </div>
          <Button variant="soft" onClick={() => setShowForm(true)}>
            <Plus className="h-4 w-4" />
            New Alert
          </Button>
        </div>

        {/* Notification Permission Banner */}
        <NotificationBanner
          permission={notificationPermission}
          onRequest={requestPermission}
        />

        {/* Live-data disconnect warning — alerts silently stop without the stream */}
        {connectionStatus !== 'connected' && activeAlerts.length > 0 && (
          <div
            role="status"
            className="flex items-center gap-2 rounded-lg border border-warning/20 bg-warning/5 px-4 py-2.5 text-sm text-warning"
          >
            <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
            Live price stream is {connectionStatus === 'reconnecting' ? 'reconnecting' : 'disconnected'}.
            Alerts will not trigger until the connection is restored.
          </div>
        )}

        {/* Create Alert Form */}
        {showForm && (
          <AlertForm
            onSubmit={(data) => {
              addAlert(data);
              setShowForm(false);
            }}
            onCancel={() => setShowForm(false)}
          />
        )}

        {/* Empty State */}
        {alerts.length === 0 && !showForm && (
          <EmptyState
            icon={Bell}
            title="No alerts yet"
            description="Create a price alert to get notified when a coin reaches your target price."
          >
            <Button variant="soft" onClick={() => setShowForm(true)}>
              <Plus className="h-4 w-4" />
              Create First Alert
            </Button>
          </EmptyState>
        )}

        {/* Active Alerts */}
        {activeAlerts.length > 0 && (
          <section>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-text-muted">
              Active Alerts ({activeAlerts.length})
            </h2>
            <div className="space-y-2">
              {activeAlerts.map((alert) => (
                <AlertCard key={alert.id} alert={alert} onRemove={setPendingDelete} />
              ))}
            </div>
          </section>
        )}

        {/* Triggered Alerts */}
        {triggeredAlerts.length > 0 && (
          <section>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-text-muted">
              Triggered ({triggeredAlerts.length})
            </h2>
            <div className="space-y-2">
              {triggeredAlerts.map((alert) => (
                <AlertCard key={alert.id} alert={alert} onRemove={setPendingDelete} triggered />
              ))}
            </div>
          </section>
        )}
      </div>

      <ConfirmDialog
        open={pendingDelete !== null}
        title={`Delete ${pendingDelete?.symbol ?? ''} alert?`}
        description={
          pendingDelete
            ? `Alert at ${formatCurrency(pendingDelete.targetPrice)} will be removed. This cannot be undone.`
            : ''
        }
        onConfirm={() => {
          if (pendingDelete) removeAlert(pendingDelete.id);
          setPendingDelete(null);
        }}
        onCancel={() => setPendingDelete(null)}
      />
    </AppShell>
  );
}

// --- Sub-components ---

function NotificationBanner({
  permission,
  onRequest,
}: {
  permission: NotificationPermission | 'unsupported';
  onRequest: () => void;
}) {
  if (permission === 'granted') {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-success/20 bg-success/5 px-4 py-2.5 text-sm text-success">
        <CheckCircle2 className="h-4 w-4 shrink-0" />
        Notifications enabled.
      </div>
    );
  }

  if (permission === 'denied') {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-danger/20 bg-danger/5 px-4 py-2.5 text-sm text-danger">
        <BellOff className="h-4 w-4 shrink-0" />
        Notifications are blocked. Enable them in browser settings to receive price alerts.
      </div>
    );
  }

  if (permission === 'unsupported') {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-warning/20 bg-warning/5 px-4 py-2.5 text-sm text-warning">
        <AlertTriangle className="h-4 w-4 shrink-0" />
        Browser notifications are not supported in this environment.
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between rounded-lg border border-border-subtle bg-bg-surface-soft px-4 py-2.5">
      <div className="flex items-center gap-2 text-sm text-text-secondary">
        <Bell className="h-4 w-4 shrink-0" />
        Enable browser notifications to receive price alerts.
      </div>
      <button
        onClick={onRequest}
        className="rounded-md bg-accent-primary/10 px-3 py-1 text-xs font-medium text-accent-primary transition-colors hover:bg-accent-primary/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
      >
        Enable
      </button>
    </div>
  );
}

function AlertCard({
  alert,
  onRemove,
  triggered,
}: {
  alert: PriceAlert;
  onRemove: (alert: PriceAlert) => void;
  triggered?: boolean;
}) {
  const prices = useMarketStore((s) => s.prices);
  const livePrice = prices[alert.symbol];
  const conditionText = alert.condition === 'greater_than' ? 'above' : 'below';

  return (
    <div className={cn('card flex items-center gap-4 px-4 py-3', triggered && 'border-success/30 bg-success/5')}>
      <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold', triggered ? 'bg-success/10 text-success' : 'bg-bg-surface text-accent-primary')}>
        {alert.symbol.slice(0, 2)}
      </span>
      <div className="flex-1">
        <div className="flex items-center gap-2">
          <p className="font-medium text-text-primary">{alert.symbol}</p>
          {triggered && (
            <span className="inline-flex items-center gap-1 rounded-full bg-success/10 px-2 py-0.5 text-[10px] font-semibold text-success">
              <CheckCircle2 className="h-3 w-3" />
              TRIGGERED
            </span>
          )}
        </div>
        <p className="text-xs text-text-secondary">
          Alert when price goes {conditionText}{' '}
          <span className="numeric font-medium text-text-primary">{formatCurrency(alert.targetPrice)}</span>
          {livePrice && !triggered && (
            <span className="text-text-muted"> · Current: {formatCurrency(livePrice.price)}</span>
          )}
        </p>
        {triggered && alert.triggeredAt && (
          <p className="text-xs font-medium text-success/80">
            Triggered{' '}
            <time dateTime={new Date(alert.triggeredAt).toISOString()}>
              {new Date(alert.triggeredAt).toLocaleString()}
            </time>
          </p>
        )}
      </div>
      {triggered && (
        <Link
          href={`/coin/${alert.symbol}`}
          className="tap-target inline-flex h-8 items-center gap-1 rounded-lg border border-border-subtle px-3 text-xs font-medium text-text-secondary transition-colors hover:border-border-strong hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
        >
          View
        </Link>
      )}
      <Button
        variant="danger-ghost"
        icon
        className="shrink-0"
        onClick={() => onRemove(alert)}
        aria-label={`Delete ${alert.symbol} alert`}
      >
        <Trash2 className="h-4 w-4" />
      </Button>
    </div>
  );
}

function AlertForm({
  onSubmit,
  onCancel,
}: {
  onSubmit: (data: { symbol: string; condition: 'greater_than' | 'less_than'; targetPrice: number }) => void;
  onCancel: () => void;
}) {
  const [symbol, setSymbol] = useState('');
  const [condition, setCondition] = useState<'greater_than' | 'less_than'>('greater_than');
  const [targetPrice, setTargetPrice] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const coin = getCoinBySymbol(symbol.toUpperCase());
    if (!coin) {
      setError('Please enter a valid coin symbol (e.g. BTC, ETH).');
      return;
    }

    const price = parseFloat(targetPrice);
    if (isNaN(price) || price <= 0) {
      setError('Target price must be greater than 0.');
      return;
    }

    onSubmit({ symbol: coin.symbol, condition, targetPrice: price });
  };

  return (
    <form onSubmit={handleSubmit} className="card space-y-4 px-4 py-5">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-text-primary">Create Alert</h3>
        <button type="button" onClick={onCancel} className="rounded p-1 text-text-muted hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring" aria-label="Close form">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div>
          <label htmlFor="alert-symbol" className="mb-1 block text-xs font-medium text-text-secondary">Coin Symbol *</label>
          <input id="alert-symbol" type="text" value={symbol} onChange={(e) => setSymbol(e.target.value)} placeholder="BTC" aria-invalid={!!error} aria-describedby={error ? 'alert-error' : undefined} className="h-9 w-full rounded-lg border border-border-subtle bg-bg-surface-raised px-3 text-sm text-text-primary placeholder:text-text-muted focus:border-accent-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring" />
        </div>
        <div>
          <label htmlFor="alert-condition" className="mb-1 block text-xs font-medium text-text-secondary">Condition *</label>
          <select id="alert-condition" value={condition} onChange={(e) => setCondition(e.target.value as 'greater_than' | 'less_than')} className="h-9 w-full rounded-lg border border-border-subtle bg-bg-surface-raised px-3 text-sm text-text-primary focus:border-accent-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring">
            <option value="greater_than">Price goes above</option>
            <option value="less_than">Price goes below</option>
          </select>
        </div>
        <div>
          <label htmlFor="alert-target" className="mb-1 block text-xs font-medium text-text-secondary">Target Price (USD) *</label>
          <input id="alert-target" type="number" step="any" min="0" value={targetPrice} onChange={(e) => setTargetPrice(e.target.value)} placeholder="70000" aria-invalid={!!error} aria-describedby={error ? 'alert-error' : undefined} className="h-9 w-full rounded-lg border border-border-subtle bg-bg-surface-raised px-3 text-sm text-text-primary placeholder:text-text-muted focus:border-accent-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring" />
        </div>
      </div>

      {error && <p id="alert-error" className="text-sm text-danger">{error}</p>}

      <div className="flex gap-2">
        <Button type="submit" variant="primary">
          Create Alert
        </Button>
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
