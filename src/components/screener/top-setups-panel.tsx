'use client';

import { TrendingUp, TrendingDown, Minus, Shield } from 'lucide-react';
import type { RankedScreenerResult, ScreenerAiAuditSummary } from '@/lib/application/screener/types';
import { cn } from '@/lib/shared/utils';
import { AiAuditBadge } from './ai-audit-badge';

interface TopSetupsPanelProps {
  results: RankedScreenerResult[];
  isLoading: boolean;
  audits?: Record<string, ScreenerAiAuditSummary>;
}

/**
 * Top setups panel — shows the top 3–5 ranked eligible setups with full
 * trade context. WAIT results are excluded from this panel (they appear
 * in the full table below).
 */
export function TopSetupsPanel({ results, isLoading, audits = {} }: TopSetupsPanelProps) {
  const eligible = results.filter((r) => r.alertEligible).slice(0, 5);

  if (isLoading && results.length === 0) {
    return <TopSetupsSkeleton />;
  }

  if (eligible.length === 0) {
    return (
      <section className="card p-5 lg:p-6">
        <h2 className="mb-3 font-[family-name:var(--font-display)] text-sm font-semibold uppercase tracking-wider text-text-muted">
          Top Setups
        </h2>
        <div className="flex items-center gap-3 rounded-lg bg-bg-surface-soft p-4">
          <Shield className="h-5 w-5 text-text-muted animate-soft-pulse" />
          <div>
            <p className="text-sm font-medium text-text-primary">No actionable setups right now</p>
            <p className="text-xs text-text-secondary">
              All symbols are in WAIT or below eligibility thresholds. This is valid analysis — the market
              may not offer clean entries at this time.
            </p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="card p-5 lg:p-6">
      <h2 className="mb-4 font-[family-name:var(--font-display)] text-sm font-semibold uppercase tracking-wider text-text-muted">
        Top Setups
      </h2>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {eligible.map((result) => (
          <SetupCard key={result.symbol} result={result} audit={audits[result.symbol]} />
        ))}
      </div>
    </section>
  );
}

function SetupCard({
  result,
  audit,
}: {
  result: RankedScreenerResult;
  audit?: ScreenerAiAuditSummary;
}) {
  const isLong = result.action === 'LONG';
  const ActionIcon = isLong ? TrendingUp : TrendingDown;
  const actionColor = isLong ? 'text-market-up' : 'text-market-down';
  const actionBg = isLong ? 'bg-market-up/10' : 'bg-market-down/10';

  const rr = result.riskReward != null ? result.riskReward.toFixed(2) : '—';
  const tps = result.takeProfits.filter((tp): tp is number => tp != null);

  return (
    <div className="group relative rounded-xl border border-border-subtle bg-bg-surface-soft p-4 transition-all hover:border-border-strong hover:shadow-lg">
      {/* Rank badge */}
      <div className="absolute -top-2 -right-2 flex h-6 w-6 items-center justify-center rounded-full bg-accent-primary text-xs font-bold text-bg-app">
        #{result.rank}
      </div>

      {/* Header */}
      <div className="flex items-center gap-2">
        <div className={cn('flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-semibold', actionBg, actionColor)}>
          <ActionIcon className="h-3 w-3" />
          {result.action}
        </div>
        <span className="font-[family-name:var(--font-display)] text-sm font-bold text-text-primary">
          {result.baseAsset}
        </span>
        <span className="text-xs text-text-muted">/{result.quoteAsset}</span>
      </div>

      {/* Metrics grid */}
      <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
        <MetricRow label="Confidence" value={`${result.confidence}%`} />
        <MetricRow label="Grade" value={result.grade} highlight />
        <MetricRow label="R:R" value={rr} />
        <MetricRow label="Score" value={result.rankingScore.toFixed(1)} />
        {result.entry != null && (
          <MetricRow label="Entry" value={formatPrice(result.entry)} />
        )}
        {result.stopLoss != null && (
          <MetricRow label="Stop Loss" value={formatPrice(result.stopLoss)} tone="danger" />
        )}
        {tps.length > 0 && (
          <MetricRow
            label={`TP${tps.length > 1 ? '1' : ''}`}
            value={formatPrice(tps[0]!)}
            tone="success"
          />
        )}
        {tps.length > 1 && (
          <MetricRow label="TP2" value={formatPrice(tps[1]!)} tone="success" />
        )}
      </div>

      {/* Rank reasons */}
      {result.rankReason.length > 0 && (
        <div className="mt-3 border-t border-border-subtle pt-2">
          <p className="text-[10px] leading-tight text-text-muted">
            {result.rankReason[0]}
          </p>
        </div>
      )}

      {/* Warnings */}
      {result.warnings.length > 0 && (
        <div className="mt-2 flex items-start gap-1 rounded-md bg-warning/5 px-2 py-1">
          <Minus className="mt-0.5 h-3 w-3 shrink-0 text-warning" />
          <p className="text-[10px] leading-tight text-warning">
            {result.warnings[0]}
          </p>
        </div>
      )}

      {/* Optional AI audit — never source of signal */}
      {audit && <AiAuditBadge audit={audit} />}
    </div>
  );
}

function MetricRow({
  label,
  value,
  highlight,
  tone,
}: {
  label: string;
  value: string;
  highlight?: boolean;
  tone?: 'success' | 'danger';
}) {
  return (
    <div className="flex items-baseline justify-between">
      <span className="text-text-muted">{label}</span>
      <span
        className={cn(
          'font-medium tabular-nums',
          highlight && 'text-accent-primary',
          tone === 'success' && 'text-success',
          tone === 'danger' && 'text-danger',
          !highlight && !tone && 'text-text-primary'
        )}
      >
        {value}
      </span>
    </div>
  );
}

function TopSetupsSkeleton() {
  return (
    <section className="card p-5 lg:p-6">
      <div className="skeleton mb-4 h-4 w-24" />
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-border-subtle bg-bg-surface-soft p-4">
            <div className="skeleton mb-3 h-5 w-20" />
            <div className="space-y-2">
              <div className="skeleton h-3 w-full" />
              <div className="skeleton h-3 w-3/4" />
              <div className="skeleton h-3 w-1/2" />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

/** Format a price with appropriate precision. */
function formatPrice(price: number): string {
  if (price >= 1000) return price.toLocaleString(undefined, { maximumFractionDigits: 2 });
  if (price >= 1) return price.toFixed(4);
  return price.toFixed(6);
}
