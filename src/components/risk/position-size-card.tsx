'use client';

import { useId, useMemo } from 'react';
import { Calculator, ShieldAlert, Settings2 } from 'lucide-react';
import { useRiskAccountStore } from '@/stores/use-risk-account-store';
import { useRiskProfileStore } from '@/stores/use-risk-profile-store';
import { formatCurrency } from '@/lib/shared/formatting';
import {
  computePositionSize,
  describePositionSizingError,
  type PositionSizingInputs,
} from '@/lib/domain/risk/position-sizing';
import { cn } from '@/lib/shared/utils';

/**
 * Position-Size Card.
 *
 * Risk-first sizing assistant for the screener detail drawer. Pulls
 * deterministic engine entry/SL from the screener row, account context
 * from the risk-account store, and the leverage cap from the active risk
 * profile. Surfaces the resulting qty / notional / margin and warns when
 * the required leverage breaks the profile cap.
 *
 * The card never modifies engine output. The profile cap takes precedence
 * when there is a conflict — the trader either lowers per-trade risk or
 * accepts the smaller capped position.
 */
export interface PositionSizeCardProps {
  side: 'LONG' | 'SHORT' | 'WAIT';
  entry: number | null;
  stopLoss: number | null;
  suggestedLeverage?: { min: number; max: number } | null;
  className?: string;
}

export function PositionSizeCard({
  side,
  entry,
  stopLoss,
  suggestedLeverage,
  className,
}: PositionSizeCardProps) {
  const accountSize = useRiskAccountStore((s) => s.accountSize);
  const riskPerTrade = useRiskAccountStore((s) => s.riskPerTrade);
  const setAccountSize = useRiskAccountStore((s) => s.setAccountSize);
  const setRiskPerTrade = useRiskAccountStore((s) => s.setRiskPerTrade);

  const profileId = useRiskProfileStore((s) => s.profileId);
  const allProfiles = useRiskProfileStore((s) => s.allProfiles());
  const profile = allProfiles.find((p) => p.id === profileId) ?? allProfiles[0]!;

  const accountId = useId();
  const riskId = useId();

  const outcome = useMemo(() => {
    if (side === 'WAIT' || entry == null || stopLoss == null) {
      return null;
    }
    const inputs: PositionSizingInputs = {
      side,
      entry,
      stopLoss,
      accountSize,
      riskPerTrade,
      maxLeverage: profile.maxLeverage,
      suggestedLeverage: suggestedLeverage ?? null,
    };
    return computePositionSize(inputs);
  }, [side, entry, stopLoss, accountSize, riskPerTrade, profile.maxLeverage, suggestedLeverage]);

  return (
    <section
      className={cn(
        'rounded-xl border border-border-subtle bg-bg-surface/70 p-4',
        className
      )}
      aria-labelledby={`${accountId}-heading`}
    >
      <h3
        id={`${accountId}-heading`}
        className="mb-3 flex items-center gap-2 text-sm font-semibold text-text-primary"
      >
        <span className="text-accent-primary">
          <Calculator className="h-4 w-4" />
        </span>
        Position Sizing
      </h3>

      <div className="grid gap-3 sm:grid-cols-2">
        <label
          htmlFor={accountId}
          className="block rounded-lg bg-bg-surface-soft p-3"
        >
          <span className="text-[10px] uppercase tracking-wider text-text-muted">
            Account size (USDT)
          </span>
          <input
            id={accountId}
            type="number"
            inputMode="decimal"
            min={1}
            step="any"
            value={accountSize}
            onChange={(event) => {
              const next = Number.parseFloat(event.target.value);
              if (Number.isFinite(next)) setAccountSize(next);
            }}
            className="mt-1 h-8 w-full rounded-md border border-transparent bg-transparent px-1 text-sm font-semibold tabular-nums text-text-primary outline-none focus:border-accent-primary/40 focus:ring-2 focus:ring-focus-ring/30"
            aria-label="Account size in USDT"
          />
        </label>

        <label
          htmlFor={riskId}
          className="block rounded-lg bg-bg-surface-soft p-3"
        >
          <span className="text-[10px] uppercase tracking-wider text-text-muted">
            Risk per trade (%)
          </span>
          <input
            id={riskId}
            type="number"
            inputMode="decimal"
            min={0.01}
            max={50}
            step="0.1"
            value={Number((riskPerTrade * 100).toFixed(4))}
            onChange={(event) => {
              const next = Number.parseFloat(event.target.value);
              if (Number.isFinite(next)) setRiskPerTrade(next / 100);
            }}
            className="mt-1 h-8 w-full rounded-md border border-transparent bg-transparent px-1 text-sm font-semibold tabular-nums text-text-primary outline-none focus:border-accent-primary/40 focus:ring-2 focus:ring-focus-ring/30"
            aria-label="Risk percent of account per trade"
          />
        </label>
      </div>

      <p className="mt-2 flex items-center gap-1.5 text-xs text-text-muted">
        <Settings2 className="h-3 w-3" />
        Leverage cap follows your{' '}
        <span className="font-medium text-text-secondary">{profile.label}</span>{' '}
        profile (max {profile.maxLeverage}x).
      </p>

      {outcome == null ? (
        <p className="mt-3 rounded-lg bg-bg-surface-soft p-3 text-sm text-text-secondary">
          {side === 'WAIT'
            ? 'WAIT decisions have no position to size. This is intentional risk-first behaviour.'
            : 'Engine entry or stop loss is unavailable, so a deterministic size cannot be computed.'}
        </p>
      ) : !outcome.ok ? (
        <div className="mt-3 rounded-lg border border-warning/30 bg-warning/10 p-3 text-sm text-warning">
          <p className="font-semibold">Cannot compute size</p>
          <p className="mt-1 text-xs">
            {describePositionSizingError(outcome.error)} ({outcome.message})
          </p>
        </div>
      ) : (
        <div className="mt-3 space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Stat
              label="Risk amount"
              value={`${formatCurrency(outcome.plan.cappedRiskAmount)} USDT`}
              hint={`${(outcome.plan.rDistancePct * 100).toFixed(2)}% stop distance`}
              tone="danger"
            />
            <Stat
              label="Quantity"
              value={`${formatQty(outcome.plan.cappedQty)}`}
              hint={`At entry ${formatCurrency(entry ?? 0)}`}
            />
            <Stat
              label="Notional"
              value={`${formatCurrency(outcome.plan.cappedNotional)} USDT`}
            />
            <Stat
              label="Margin @ cap"
              value={`${formatCurrency(outcome.plan.marginAtCappedLeverage)} USDT`}
              hint={`Cap ${outcome.plan.cappedLeverage}x`}
            />
          </div>

          <div
            className={cn(
              'rounded-lg border p-3 text-xs',
              outcome.plan.leverageExceedsCap
                ? 'border-warning/30 bg-warning/10 text-warning'
                : 'border-border-subtle bg-bg-surface-soft text-text-secondary'
            )}
          >
            <p className="flex items-center gap-1.5 font-semibold">
              <ShieldAlert className="h-3.5 w-3.5" />
              {outcome.plan.leverageExceedsCap
                ? 'Required leverage exceeds your profile cap'
                : 'Leverage is within your profile cap'}
            </p>
            <p className="mt-1">
              Required leverage{' '}
              <span className="font-semibold tabular-nums">
                {outcome.plan.requiredLeverage.toFixed(2)}x
              </span>{' '}
              vs cap{' '}
              <span className="font-semibold tabular-nums">
                {outcome.plan.cappedLeverage}x
              </span>
              .{' '}
              {outcome.plan.leverageExceedsCap
                ? 'Position was reduced to the cap. To risk the full amount, lower leverage by relaxing your stop or accept the smaller position.'
                : 'No adjustments needed.'}
            </p>
          </div>

          <p className="text-[11px] text-text-muted">
            Educational sizing assistant. Excludes fees, funding, and slippage.
            The engine&rsquo;s entry and stop loss are authoritative.
          </p>
        </div>
      )}
    </section>
  );
}

function Stat({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: 'danger' | 'success';
}) {
  return (
    <div className="rounded-lg bg-bg-surface-soft p-3">
      <div className="text-[10px] uppercase tracking-wider text-text-muted">
        {label}
      </div>
      <div
        className={cn(
          'mt-1 text-sm font-semibold tabular-nums',
          tone === 'danger' && 'text-danger',
          tone === 'success' && 'text-success',
          !tone && 'text-text-primary'
        )}
      >
        {value}
      </div>
      {hint ? <div className="mt-0.5 text-xs text-text-muted">{hint}</div> : null}
    </div>
  );
}

/**
 * Format a base-asset quantity with sensible precision for futures pairs.
 * Big positions show 4 decimals, fractional crypto shows up to 8.
 */
function formatQty(qty: number): string {
  if (!Number.isFinite(qty)) return '—';
  if (qty >= 1000) return new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(qty);
  if (qty >= 1) return qty.toFixed(4);
  return qty.toFixed(8).replace(/0+$/, '').replace(/\.$/, '');
}
