'use client';

import { useEffect, useState } from 'react';
import { AppShell } from '@/components/layout/app-shell';
import { usePortfolioStore } from '@/stores/use-portfolio-store';
import { useMarketStore } from '@/stores/use-market-store';
import { getCoinBySymbol } from '@/lib/registry/coin-registry';
import { formatCurrency, formatPercentage } from '@/lib/formatting';
import { cn } from '@/lib/utils';
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
              Portfolio
            </h1>
            <p className="mt-1 text-sm text-text-secondary">
              Track your crypto holdings and profit/loss.
            </p>
          </div>
          <button
            onClick={() => { setShowForm(true); setEditingId(null); }}
            className="inline-flex items-center gap-2 rounded-lg bg-accent-primary/10 px-4 py-2 text-sm font-medium text-accent-primary transition-colors hover:bg-accent-primary/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
          >
            <Plus className="h-4 w-4" />
            Add Holding
          </button>
        </div>

        {/* Summary Cards */}
        {holdings.length > 0 && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <SummaryCard label="Total Value" value={formatCurrency(summary.totalValue)} />
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
          <div className="card flex flex-col items-center px-6 py-12 text-center">
            <Wallet className="h-12 w-12 text-text-muted/30" />
            <h2 className="mt-4 text-lg font-semibold text-text-primary">No holdings yet</h2>
            <p className="mt-2 max-w-sm text-sm text-text-secondary">
              Add your crypto holdings to track portfolio value and profit/loss.
            </p>
            <button
              onClick={() => setShowForm(true)}
              className="mt-4 inline-flex items-center gap-2 rounded-lg bg-accent-primary/10 px-4 py-2 text-sm font-medium text-accent-primary transition-colors hover:bg-accent-primary/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
            >
              <Plus className="h-4 w-4" />
              Add First Holding
            </button>
          </div>
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
                      {h.currentPrice ? formatCurrency(h.currentPrice) : '—'}
                    </td>
                    <td className="numeric px-4 py-3 font-medium text-text-primary">
                      {h.currentValue > 0 ? formatCurrency(h.currentValue) : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <PnlDisplay pnl={h.pnl} pnlPercent={h.pnlPercent} />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          onClick={() => { setEditingId(h.id); setShowForm(true); }}
                          className="inline-flex h-7 w-7 items-center justify-center rounded text-text-muted hover:bg-bg-surface-soft hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
                          aria-label={`Edit ${h.symbol} holding`}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => removeHolding(h.id)}
                          className="inline-flex h-7 w-7 items-center justify-center rounded text-text-muted hover:bg-danger/10 hover:text-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
                          aria-label={`Delete ${h.symbol} holding`}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
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
                        {h.currentValue > 0 ? formatCurrency(h.currentValue) : '—'}
                      </p>
                    </div>
                    <div className="flex items-center justify-between">
                      <p className="text-xs text-text-muted">{h.quantity} units</p>
                      <PnlDisplay pnl={h.pnl} pnlPercent={h.pnlPercent} compact />
                    </div>
                  </div>
                  <button
                    onClick={() => removeHolding(h.id)}
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded text-text-muted hover:bg-danger/10 hover:text-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
                    aria-label={`Delete ${h.symbol}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}

// --- Sub-components ---

/**

 * Komponen SummaryCard untuk merender bagian UI terkait summary card.

 * Menjaga struktur tampilan tetap terpisah dari halaman atau komponen induk.

 */

function SummaryCard({ label, value, change }: { label: string; value: string; change?: number | null }) {
  const isUp = (change ?? 0) > 0;
  const isDown = (change ?? 0) < 0;

  return (
    <div className="card px-4 py-3.5">
      <p className="text-xs font-medium uppercase tracking-wider text-text-muted">{label}</p>
      <p className="numeric mt-1 text-2xl font-bold text-text-primary">{value}</p>
      {change != null && (
        <span className={cn('numeric mt-1 inline-flex items-center gap-1 text-sm font-medium', isUp && 'text-market-up', isDown && 'text-market-down', !isUp && !isDown && 'text-market-neutral')}>
          {isUp && <TrendingUp className="h-3 w-3" />}
          {isDown && <TrendingDown className="h-3 w-3" />}
          {!isUp && !isDown && <Minus className="h-3 w-3" />}
          {formatPercentage(change)}
        </span>
      )}
    </div>
  );
}

/**

 * Komponen PnlDisplay untuk merender bagian UI terkait pnl display.

 * Menjaga struktur tampilan tetap terpisah dari halaman atau komponen induk.

 */

function PnlDisplay({ pnl, pnlPercent, compact }: { pnl: number | null; pnlPercent: number | null; compact?: boolean }) {
  if (pnl == null) return <span className={cn('text-text-muted', compact ? 'text-xs' : 'text-sm')}>—</span>;

  const isUp = pnl > 0;
  const isDown = pnl < 0;

  return (
    <span className={cn('numeric inline-flex items-center gap-1 font-medium', compact ? 'text-xs' : 'text-sm', isUp && 'text-market-up', isDown && 'text-market-down', !isUp && !isDown && 'text-market-neutral')}>
      {isUp && <TrendingUp className="h-3 w-3" />}
      {isDown && <TrendingDown className="h-3 w-3" />}
      {formatCurrency(pnl)} {pnlPercent != null && `(${formatPercentage(pnlPercent)})`}
    </span>
  );
}

/**

 * Komponen HoldingForm untuk merender bagian UI terkait holding form.

 * Menjaga struktur tampilan tetap terpisah dari halaman atau komponen induk.

 */

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

  /**

   * Menjalankan logic handle submit.

   * Dipakai untuk memisahkan tanggung jawab fungsi ini dari bagian aplikasi lain.

   */

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
          <input id="holding-symbol" type="text" value={symbol} onChange={(e) => setSymbol(e.target.value)} placeholder="BTC" disabled={!!editingHolding} className="h-9 w-full rounded-lg border border-border-subtle bg-bg-surface-raised px-3 text-sm text-text-primary placeholder:text-text-muted focus:border-accent-primary focus:outline-none focus:ring-2 focus:ring-focus-ring/30 disabled:opacity-50" />
        </div>
        <div>
          <label htmlFor="holding-quantity" className="mb-1 block text-xs font-medium text-text-secondary">Quantity *</label>
          <input id="holding-quantity" type="number" step="any" min="0" value={quantity} onChange={(e) => setQuantity(e.target.value)} placeholder="0.5" className="h-9 w-full rounded-lg border border-border-subtle bg-bg-surface-raised px-3 text-sm text-text-primary placeholder:text-text-muted focus:border-accent-primary focus:outline-none focus:ring-2 focus:ring-focus-ring/30" />
        </div>
        <div>
          <label htmlFor="holding-buyprice" className="mb-1 block text-xs font-medium text-text-secondary">Avg Buy Price (optional)</label>
          <input id="holding-buyprice" type="number" step="any" min="0" value={buyPrice} onChange={(e) => setBuyPrice(e.target.value)} placeholder="65000" className="h-9 w-full rounded-lg border border-border-subtle bg-bg-surface-raised px-3 text-sm text-text-primary placeholder:text-text-muted focus:border-accent-primary focus:outline-none focus:ring-2 focus:ring-focus-ring/30" />
        </div>
      </div>

      {error && <p className="text-sm text-danger">{error}</p>}

      <div className="flex gap-2">
        <button type="submit" className="rounded-lg bg-accent-primary px-4 py-2 text-sm font-medium text-bg-app transition-colors hover:bg-accent-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring">
          {editingHolding ? 'Update' : 'Add Holding'}
        </button>
        <button type="button" onClick={onCancel} className="rounded-lg bg-bg-surface-raised px-4 py-2 text-sm font-medium text-text-secondary transition-colors hover:bg-bg-surface-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring">
          Cancel
        </button>
      </div>
    </form>
  );
}
