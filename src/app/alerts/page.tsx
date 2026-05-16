'use client';

import { useEffect, useState } from 'react';
import { AppShell } from '@/components/layout/app-shell';
import { useAlertStore } from '@/stores/use-alert-store';
import { useMarketStore } from '@/stores/use-market-store';
import { getCoinBySymbol } from '@/lib/registry/coin-registry';
import { formatCurrency } from '@/lib/formatting';
import { cn } from '@/lib/utils';
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

  const [showForm, setShowForm] = useState(false);
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
        <div className="card animate-pulse p-6">
          <div className="h-6 w-32 rounded bg-bg-surface-raised" />
          <div className="mt-4 space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-14 rounded bg-bg-surface-raised" />
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
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-[family-name:var(--font-display)] text-2xl font-bold text-text-primary">
              Price Alerts
            </h1>
            <p className="mt-1 text-sm text-text-secondary">
              Get notified when prices hit your targets. Alerts work while browser is active.
            </p>
          </div>
          <button
            onClick={() => setShowForm(true)}
            className="inline-flex items-center gap-2 rounded-lg bg-accent-primary/10 px-4 py-2 text-sm font-medium text-accent-primary transition-colors hover:bg-accent-primary/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
          >
            <Plus className="h-4 w-4" />
            New Alert
          </button>
        </div>

        {/* Notification Permission Banner */}
        <NotificationBanner
          permission={notificationPermission}
          onRequest={requestPermission}
        />

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
          <div className="card flex flex-col items-center px-6 py-12 text-center">
            <Bell className="h-12 w-12 text-text-muted/30" />
            <h2 className="mt-4 text-lg font-semibold text-text-primary">No alerts yet</h2>
            <p className="mt-2 max-w-sm text-sm text-text-secondary">
              Create a price alert to get notified when a coin reaches your target price.
            </p>
            <button
              onClick={() => setShowForm(true)}
              className="mt-4 inline-flex items-center gap-2 rounded-lg bg-accent-primary/10 px-4 py-2 text-sm font-medium text-accent-primary transition-colors hover:bg-accent-primary/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
            >
              <Plus className="h-4 w-4" />
              Create First Alert
            </button>
          </div>
        )}

        {/* Active Alerts */}
        {activeAlerts.length > 0 && (
          <section>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-text-muted">
              Active Alerts ({activeAlerts.length})
            </h2>
            <div className="space-y-2">
              {activeAlerts.map((alert) => (
                <AlertCard key={alert.id} alert={alert} onRemove={removeAlert} />
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
                <AlertCard key={alert.id} alert={alert} onRemove={removeAlert} triggered />
              ))}
            </div>
          </section>
        )}
      </div>
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
  onRemove: (id: string) => void;
  triggered?: boolean;
}) {
  const prices = useMarketStore((s) => s.prices);
  const livePrice = prices[alert.symbol];
  const conditionText = alert.condition === 'greater_than' ? 'above' : 'below';

  return (
    <div className={cn('card flex items-center gap-4 px-4 py-3', triggered && 'opacity-70')}>
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-bg-surface text-xs font-bold text-accent-primary">
        {alert.symbol.slice(0, 2)}
      </span>
      <div className="flex-1">
        <div className="flex items-center gap-2">
          <p className="font-medium text-text-primary">{alert.symbol}</p>
          {triggered && (
            <span className="rounded-full bg-success/10 px-2 py-0.5 text-[10px] font-semibold text-success">
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
          <p className="text-xs text-text-muted">
            Triggered at {new Date(alert.triggeredAt).toLocaleString()}
          </p>
        )}
      </div>
      <button
        onClick={() => onRemove(alert.id)}
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-text-muted transition-colors hover:bg-danger/10 hover:text-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
        aria-label={`Delete ${alert.symbol} alert`}
      >
        <Trash2 className="h-4 w-4" />
      </button>
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
          <input id="alert-symbol" type="text" value={symbol} onChange={(e) => setSymbol(e.target.value)} placeholder="BTC" className="h-9 w-full rounded-lg border border-border-subtle bg-bg-surface-raised px-3 text-sm text-text-primary placeholder:text-text-muted focus:border-accent-primary focus:outline-none focus:ring-2 focus:ring-focus-ring/30" />
        </div>
        <div>
          <label htmlFor="alert-condition" className="mb-1 block text-xs font-medium text-text-secondary">Condition *</label>
          <select id="alert-condition" value={condition} onChange={(e) => setCondition(e.target.value as 'greater_than' | 'less_than')} className="h-9 w-full rounded-lg border border-border-subtle bg-bg-surface-raised px-3 text-sm text-text-primary focus:border-accent-primary focus:outline-none focus:ring-2 focus:ring-focus-ring/30">
            <option value="greater_than">Price goes above</option>
            <option value="less_than">Price goes below</option>
          </select>
        </div>
        <div>
          <label htmlFor="alert-target" className="mb-1 block text-xs font-medium text-text-secondary">Target Price (USD) *</label>
          <input id="alert-target" type="number" step="any" min="0" value={targetPrice} onChange={(e) => setTargetPrice(e.target.value)} placeholder="70000" className="h-9 w-full rounded-lg border border-border-subtle bg-bg-surface-raised px-3 text-sm text-text-primary placeholder:text-text-muted focus:border-accent-primary focus:outline-none focus:ring-2 focus:ring-focus-ring/30" />
        </div>
      </div>

      {error && <p className="text-sm text-danger">{error}</p>}

      <div className="flex gap-2">
        <button type="submit" className="rounded-lg bg-accent-primary px-4 py-2 text-sm font-medium text-bg-app transition-colors hover:bg-accent-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring">
          Create Alert
        </button>
        <button type="button" onClick={onCancel} className="rounded-lg bg-bg-surface-raised px-4 py-2 text-sm font-medium text-text-secondary transition-colors hover:bg-bg-surface-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring">
          Cancel
        </button>
      </div>
    </form>
  );
}
