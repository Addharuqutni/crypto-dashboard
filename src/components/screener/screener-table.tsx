'use client';

import { TrendingUp, TrendingDown, Pause, CheckCircle2, XCircle } from 'lucide-react';
import type { RankedScreenerResult } from '@/lib/screener/types';
import { cn } from '@/lib/utils';

interface ScreenerTableProps {
  results: RankedScreenerResult[];
  isLoading: boolean;
}

/**
 * Full screener table — all 10 coins with key metrics. WAIT is displayed
 * as a valid decision with neutral styling, not as an error.
 */
export function ScreenerTable({ results, isLoading }: ScreenerTableProps) {
  if (isLoading && results.length === 0) {
    return <TableSkeleton />;
  }

  if (results.length === 0) {
    return null;
  }

  return (
    <section className="card overflow-hidden">
      <div className="border-b border-border-subtle px-5 py-3 lg:px-6">
        <h2 className="font-[family-name:var(--font-display)] text-sm font-semibold uppercase tracking-wider text-text-muted">
          All Coins
        </h2>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[800px] text-sm">
          <thead>
            <tr className="border-b border-border-subtle text-left text-xs uppercase tracking-wider text-text-muted">
              <th className="px-4 py-3 font-medium">Symbol</th>
              <th className="px-4 py-3 font-medium">Rank</th>
              <th className="px-4 py-3 font-medium">Action</th>
              <th className="px-4 py-3 font-medium">Confidence</th>
              <th className="px-4 py-3 font-medium">Grade</th>
              <th className="px-4 py-3 font-medium">Score</th>
              <th className="px-4 py-3 font-medium">Regime</th>
              <th className="px-4 py-3 font-medium">Permission</th>
              <th className="px-4 py-3 font-medium">Data</th>
              <th className="px-4 py-3 font-medium">Eligible</th>
            </tr>
          </thead>
          <tbody>
            {results.map((row) => (
              <ScreenerRow key={row.symbol} row={row} />
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function ScreenerRow({ row }: { row: RankedScreenerResult }) {
  return (
    <tr className="border-b border-border-subtle/50 transition-colors hover:bg-bg-surface-raised/50">
      {/* Symbol */}
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-text-primary">{row.baseAsset}</span>
          <span className="text-xs text-text-muted">#{row.marketCapRank ?? '—'}</span>
        </div>
      </td>

      {/* Rank */}
      <td className="px-4 py-3 tabular-nums">
        {row.rank > 0 ? (
          <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-accent-primary/15 text-xs font-bold text-accent-primary">
            {row.rank}
          </span>
        ) : (
          <span className="text-text-muted">—</span>
        )}
      </td>

      {/* Action */}
      <td className="px-4 py-3">
        <ActionBadge action={row.action} />
      </td>

      {/* Confidence */}
      <td className="px-4 py-3 tabular-nums">
        <ConfidenceBar value={row.confidence} />
      </td>

      {/* Grade */}
      <td className="px-4 py-3">
        <GradeBadge grade={row.grade} />
      </td>

      {/* Score */}
      <td className="px-4 py-3 tabular-nums text-text-primary">
        {row.rankingScore.toFixed(1)}
      </td>

      {/* Regime */}
      <td className="px-4 py-3">
        <span className="text-xs text-text-secondary">{formatRegime(row.marketRegime)}</span>
      </td>

      {/* Permission */}
      <td className="px-4 py-3">
        <span className={cn(
          'text-xs',
          row.tradePermission === 'both' && 'text-success',
          row.tradePermission === 'no_trade' && 'text-danger',
          (row.tradePermission === 'long_only' || row.tradePermission === 'short_only') && 'text-warning'
        )}>
          {formatPermission(row.tradePermission)}
        </span>
      </td>

      {/* Data health */}
      <td className="px-4 py-3">
        {row.dataHealth.ok ? (
          <CheckCircle2 className="h-4 w-4 text-success" />
        ) : (
          <XCircle className="h-4 w-4 text-danger" />
        )}
      </td>

      {/* Eligible */}
      <td className="px-4 py-3">
        {row.alertEligible ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-success/10 px-2 py-0.5 text-xs font-medium text-success">
            Yes
          </span>
        ) : (
          <span className="text-xs text-text-muted">No</span>
        )}
      </td>
    </tr>
  );
}

function ActionBadge({ action }: { action: string }) {
  if (action === 'LONG') {
    return (
      <span className="inline-flex items-center gap-1 rounded-md bg-market-up/10 px-2 py-0.5 text-xs font-semibold text-market-up">
        <TrendingUp className="h-3 w-3" />
        LONG
      </span>
    );
  }
  if (action === 'SHORT') {
    return (
      <span className="inline-flex items-center gap-1 rounded-md bg-market-down/10 px-2 py-0.5 text-xs font-semibold text-market-down">
        <TrendingDown className="h-3 w-3" />
        SHORT
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-md bg-market-neutral/10 px-2 py-0.5 text-xs font-semibold text-market-neutral">
      <Pause className="h-3 w-3" />
      WAIT
    </span>
  );
}

function ConfidenceBar({ value }: { value: number }) {
  const width = Math.min(100, Math.max(0, value));
  const color =
    value >= 75 ? 'bg-success' : value >= 60 ? 'bg-warning' : 'bg-text-muted';
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-12 overflow-hidden rounded-full bg-bg-surface-raised">
        <div className={cn('h-full rounded-full transition-all', color)} style={{ width: `${width}%` }} />
      </div>
      <span className="text-xs text-text-primary">{value}</span>
    </div>
  );
}

function GradeBadge({ grade }: { grade: string }) {
  const color =
    grade === 'A' ? 'text-success bg-success/10' :
    grade === 'B' ? 'text-accent-primary bg-accent-primary/10' :
    grade === 'C' ? 'text-warning bg-warning/10' :
    'text-text-muted bg-bg-surface-raised';
  return (
    <span className={cn('inline-flex h-5 w-5 items-center justify-center rounded text-xs font-bold', color)}>
      {grade}
    </span>
  );
}

function formatRegime(regime: string): string {
  return regime.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatPermission(perm: string): string {
  switch (perm) {
    case 'both': return 'Both';
    case 'long_only': return 'Long only';
    case 'short_only': return 'Short only';
    case 'no_trade': return 'No trade';
    default: return perm;
  }
}

function TableSkeleton() {
  return (
    <section className="card overflow-hidden">
      <div className="border-b border-border-subtle px-5 py-3">
        <div className="skeleton h-4 w-20" />
      </div>
      <div className="p-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex gap-4 py-3">
            <div className="skeleton h-4 w-16" />
            <div className="skeleton h-4 w-10" />
            <div className="skeleton h-4 w-14" />
            <div className="skeleton h-4 w-12" />
            <div className="skeleton h-4 w-8" />
            <div className="skeleton h-4 w-12" />
          </div>
        ))}
      </div>
    </section>
  );
}
