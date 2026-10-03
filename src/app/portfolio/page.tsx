'use client';

import { useEffect, useState } from 'react';
import { AppShell } from '@/components/layout/app-shell';
import { EmptyState } from '@/components/ui/empty-state';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { usePortfolioStore } from '@/stores/use-portfolio-store';
import { useMarketStore } from '@/stores/use-market-store';
import { getCoinBySymbol } from '@/lib/shared/registry/coin-registry';
import { formatCurrency, formatPercentage } from '@/lib/shared/formatting';
import { buildPriceChangeAriaLabel } from '@/lib/shared/a11y/price-change-label';
import { buildPnlAriaLabel } from '@/lib/shared/a11y/pnl-label';
import { cn } from '@/lib/shared/utils';
import { Plus, Pencil, Trash2, X, TrendingUp, TrendingDown, Minus, Wallet } from 'lucide-react';
import type { PortfolioHolding, CalculatedHolding, PortfolioSummary } from '@/types/portfolio';

/**
 * Portfolio page — track crypto holdings and P/L.
 */
export default function PortfolioPage() {
  const holdings = usePortfolioStore((s) => s.holdings);
  const hydrated = usePortfolioStore((s) => s.hydrated);
  const hydrate = usePortfolioStore((s) => s.hydrate);
  const addHolding = usePortfolioStore((s) => s.addHolding);
  const updateHolding = usePortfolioStore((s) => s.updateHolding);
  const removeHolding = usePortfolioStore((s) => s.removeHolding);
  const prices = useMarketStore((s) => s.prices);

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<CalculatedHolding | null>(null);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  // Calculate holdings with live prices
  const calculated: CalculatedHolding[] = holdings.map((h) => {
    const livePrice = prices[h.symbol];
    const currentPrice = livePrice?.price;
    const currentValue = currentPrice ? currentPrice * h.quantity : 0;
    const cost = h.averageBuyPrice ? h.averageBuyPrice * h.quantity : null;
    const pnl = cost != null && currentPrice ? currentValue - cost : null;
    const pnlPercent = cost != null && cost > 0 && pnl != null ? (pnl / cost) * 100 : null;

    return { ...h, currentPrice, currentValue, pnl, pnlPercent };
  });

  // Portfolio summary
  const summary: PortfolioSummary = {
    totalValue: calculated.reduce((sum, h) => sum + h.currentValue, 0),
    totalCost: calculated.reduce((sum, h) => sum + (h.averageBuyPrice ? h.averageBuyPrice * h.quantity : 0), 0),
    totalPnl: calculated.reduce((sum, h) => sum + (h.pnl ?? 0), 0),
    totalPnlPercent: null,
    holdingsCount: holdings.length,
  };
  if (summary.totalCost > 0) {
    summary.totalPnlPercent = ((summary.totalValue - summary.totalCost) / summary.totalCost) * 100;
  }

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
              Portfolio
            </h1>
            <p className="mt-1 text-sm text-text-secondary">
              Track your crypto holdings and profit/loss.
            </p>
          </div>
          <Button variant="soft" onClick={() => { setShowForm(true); setEditingId(null); }}>
            <Plus className="h-4 w-4" />
            Add Holding
          </Button>
        </div>

        {/* Summary Cards */}
        {holdings.length > 0 && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <SummaryCard label="Total Value" value={formatCurrency(summary.totalValue)} hero />
            <SummaryCard
              label="Total P/L"
              value={summary.totalCost > 0 ? formatCurrency(summary.totalPnl) : '—'}
              change={summary.totalPnlPercent}
            />
            <SummaryCard label="Holdings" value={String(summary.holdingsCount)} />
            <SummaryCard label="Total Cost" value={summary.totalCost > 0 ? formatCurrency(summary.totalCost) : '—'} />
          </div>
        )}

        {/* Empty State */}
        {holdings.length === 0 && !showForm && (
          <EmptyState
            icon={Wallet}
            title="No holdings yet"
            description="Add your crypto holdings to track portfolio value and profit/loss."
          >
            <Button variant="soft" onClick={() => setShowForm(true)}>
              <Plus className="h-4 w-4" />
              Add First Holding
            </Button>
          </EmptyState>
        )}

        {/* Add/Edit Form */}
        {showForm && (
          <HoldingForm
            editingHolding={editingId ? holdings.find((h) => h.id === editingId) : undefined}
            onSubmit={(data) => {
              if (editingId) {
                updateHolding(editingId, data);
              } else {
                addHolding(data);
              }
              setShowForm(false);
              setEditingId(null);
            }}
            onCancel={() => { setShowForm(false); setEditingId(null); }}
          />
        )}

        {/* Holdings Table */}
        {holdings.length > 0 && (
          <div className="card overflow-hidden">
            <table className="hidden w-full text-sm md:table">
              <thead>
                <tr className="border-b border-border-subtle text-left text-xs font-medium uppercase tracking-wider text-text-muted">
                  <th className="px-4 py-3">Coin</th>
                  <th className="px-4 py-3">Quantity</th>
                  <th className="px-4 py-3">Avg Buy</th>
                  <th className="px-4 py-3">Current Price</th>
                  <th className="px-4 py-3">Value</th>
                  <th className="px-4 py-3">P/L</th>
                  <th className="px-4 py-3 text-center">Actions</th>
                </tr>
              </thead>
              <tbody>
                {calculated.map((h) => (
                  <tr key={h.id} className="border-b border-border-subtle/50 transition-colors hover:bg-bg-surface-soft/50">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-bg-surface text-xs font-bold text-accent-primary">
                          {h.symbol.slice(0, 2)}
                        </span>
                        <div>
                          <p className="font-medium text-text-primary">{h.name}</p>
                          <p className="text-xs text-text-muted">{h.symbol}</p>
                        </div>
                      </div>
                    </td>
                    <td className="numeric px-4 py-3 text-text-primary">{h.quantity}</td>
                    <td className="numeric px-4 py-3 text-text-secondary">
                      {h.averageBuyPrice ? formatCurrency(h.averageBuyPrice) : '—'}
                    </td>
                    <td className="numeric px-4 py-3 text-text-primary">
                      {h.currentPrice ? (
                        formatCurrency(h.currentPrice)
                      ) : (
                        <span className="text-xs text-text-muted" title="Waiting for live price">
                          awaiting price
                        </span>
                      )}
                    </td>
                    <td className="numeric px-4 py-3 font-medium text-text-primary">
                      {h.currentPrice ? formatCurrency(h.currentValue) : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <PnlDisplay pnl={h.pnl} pnlPercent={h.pnlPercent} />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center gap-1">
                        <Button
                          variant="ghost"
                          icon
                          className="bg-transparent hover:bg-bg-surface-soft hover:text-text-primary"
                          onClick={() => { setEditingId(h.id); setShowForm(true); }}
                          aria-label={`Edit ${h.symbol} holding`}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="danger-ghost"
                          icon
                          onClick={() => setPendingDelete(h)}
                          aria-label={`Delete ${h.symbol} holding`}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Mobile cards */}
            <div className="flex flex-col divide-y divide-border-subtle/50 md:hidden">
              {calculated.map((h) => (
                <div key={h.id} className="flex items-center gap-3 px-4 py-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-bg-surface text-xs font-bold text-accent-primary">
                    {h.symbol.slice(0, 2)}
                  </span>
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <p className="font-medium text-text-primary">{h.symbol}</p>
                      <p className="numeric font-medium text-text-primary">
                        {h.currentPrice ? (
                          formatCurrency(h.currentValue)
                        ) : (
                          <span className="text-xs font-normal text-text-muted">awaiting price</span>
                        )}
                      </p>
                    </div>
                    <div className="flex items-center justify-between">
                      <p className="text-xs text-text-muted">{h.quantity} units</p>
                      <PnlDisplay pnl={h.pnl} pnlPercent={h.pnlPercent} compact />
                    </div>
                  </div>
                  <Button
                    variant="danger-ghost"
                    icon
                    className="shrink-0"
                    onClick={() => setPendingDelete(h)}
                    aria-label={`Delete ${h.symbol}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <ConfirmDialog
        open={pendingDelete !== null}
        title={`Delete ${pendingDelete?.symbol ?? ''} holding?`}
        description={
          pendingDelete
            ? `${pendingDelete.quantity} ${pendingDelete.symbol} will be removed from your portfolio. This cannot be undone.`
            : ''
        }
        onConfirm={() => {
          if (pendingDelete) removeHolding(pendingDelete.id);
          setPendingDelete(null);
        }}
        onCancel={() => setPendingDelete(null)}
      />
    </AppShell>
  );
}

// --- Sub-components ---

function SummaryCard({ label, value, change, hero = false }: { label: string; value: string; change?: number | null; hero?: boolean }) {
  const isUp = (change ?? 0) > 0;
  const isDown = (change ?? 0) < 0;

  return (
    <div className={cn('card p-5', hero && 'sm:col-span-2')}>
      <p className="text-xs font-medium uppercase tracking-wider text-text-muted">{label}</p>
      <p className={cn('numeric mt-1 font-bold text-text-primary', hero ? 'text-3xl' : 'text-xl')}>{value}</p>
      {change != null && (
        <span
          className={cn('numeric mt-1 inline-flex items-center gap-1 text-sm font-medium', isUp && 'text-market-up', isDown && 'text-market-down', !isUp && !isDown && 'text-market-neutral')}
          aria-label={buildPriceChangeAriaLabel(label, change)}
        >
          {isUp && <TrendingUp className="h-3 w-3" aria-hidden="true" />}
          {isDown && <TrendingDown className="h-3 w-3" aria-hidden="true" />}
          {!isUp && !isDown && <Minus className="h-3 w-3" aria-hidden="true" />}
          {formatPercentage(change)}
        </span>
      )}
    </div>
  );
}

/**
 * PnlDisplay — small inline cell that renders a profit/loss value with a
 * coloured directional icon, an optional percentage, and an aria-label that
 * pairs both magnitudes into a single screen-reader sentence.
 *
 * `compact` shrinks the typography for table rows.
 */

function PnlDisplay({ pnl, pnlPercent, compact }: { pnl: number | null; pnlPercent: number | null; compact?: boolean }) {
  if (pnl == null) return <span className={cn('text-text-muted', compact ? 'text-xs' : 'text-sm')} aria-label={buildPnlAriaLabel(null, null)}>—</span>;

  const isUp = pnl > 0;
  const isDown = pnl < 0;

  return (
    <span
      className={cn('numeric inline-flex items-center gap-1 font-medium', compact ? 'text-xs' : 'text-sm', isUp && 'text-market-up', isDown && 'text-market-down', !isUp && !isDown && 'text-market-neutral')}
      aria-label={buildPnlAriaLabel(pnl, pnlPercent)}
    >
      {isUp && <TrendingUp className="h-3 w-3" aria-hidden="true" />}
      {isDown && <TrendingDown className="h-3 w-3" aria-hidden="true" />}
      {formatCurrency(pnl)} {pnlPercent != null && `(${formatPercentage(pnlPercent)})`}
    </span>
  );
}

function HoldingForm({
  editingHolding,
  onSubmit,
  onCancel,
}: {
  editingHolding?: PortfolioHolding;
  onSubmit: (data: { symbol: string; name: string; quantity: number; averageBuyPrice?: number }) => void;
  onCancel: () => void;
}) {
  const [symbol, setSymbol] = useState(editingHolding?.symbol ?? '');
  const [quantity, setQuantity] = useState(editingHolding?.quantity?.toString() ?? '');
  const [buyPrice, setBuyPrice] = useState(editingHolding?.averageBuyPrice?.toString() ?? '');
  const [error, setError] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const coin = getCoinBySymbol(symbol.toUpperCase());
    if (!coin) {
      setError('Please enter a valid coin symbol (e.g. BTC, ETH).');
      return;
    }

    const qty = parseFloat(quantity);
    if (isNaN(qty) || qty <= 0) {
      setError('Quantity must be greater than 0.');
      return;
    }

    const price = buyPrice ? parseFloat(buyPrice) : undefined;
    if (price !== undefined && (isNaN(price) || price <= 0)) {
      setError('Buy price must be greater than 0.');
      return;
    }

    onSubmit({ symbol: coin.symbol, name: coin.name, quantity: qty, averageBuyPrice: price });
  };

  return (
    <form onSubmit={handleSubmit} className="card space-y-4 px-4 py-5">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-text-primary">
          {editingHolding ? 'Edit Holding' : 'Add Holding'}
        </h3>
        <button type="button" onClick={onCancel} className="rounded p-1 text-text-muted hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring" aria-label="Close form">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div>
          <label htmlFor="holding-symbol" className="mb-1 block text-xs font-medium text-text-secondary">Coin Symbol *</label>
          <input id="holding-symbol" type="text" value={symbol} onChange={(e) => setSymbol(e.target.value)} placeholder="BTC" disabled={!!editingHolding} aria-invalid={!!error} aria-describedby={error ? 'holding-error' : undefined} className="h-9 w-full rounded-lg border border-border-subtle bg-bg-surface-raised px-3 text-sm text-text-primary placeholder:text-text-muted focus:border-accent-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring disabled:opacity-50" />
        </div>
        <div>
          <label htmlFor="holding-quantity" className="mb-1 block text-xs font-medium text-text-secondary">Quantity *</label>
          <input id="holding-quantity" type="number" step="any" min="0" value={quantity} onChange={(e) => setQuantity(e.target.value)} placeholder="0.5" aria-invalid={!!error} aria-describedby={error ? 'holding-error' : undefined} className="h-9 w-full rounded-lg border border-border-subtle bg-bg-surface-raised px-3 text-sm text-text-primary placeholder:text-text-muted focus:border-accent-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring" />
        </div>
        <div>
          <label htmlFor="holding-buyprice" className="mb-1 block text-xs font-medium text-text-secondary">Avg Buy Price (optional)</label>
          <input id="holding-buyprice" type="number" step="any" min="0" value={buyPrice} onChange={(e) => setBuyPrice(e.target.value)} placeholder="65000" aria-invalid={!!error} aria-describedby={error ? 'holding-error' : undefined} className="h-9 w-full rounded-lg border border-border-subtle bg-bg-surface-raised px-3 text-sm text-text-primary placeholder:text-text-muted focus:border-accent-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring" />
        </div>
      </div>

      {error && <p id="holding-error" className="text-sm text-danger">{error}</p>}

      <div className="flex gap-2">
        <Button type="submit" variant="primary">
          {editingHolding ? 'Update' : 'Add Holding'}
        </Button>
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
