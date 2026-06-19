'use client';

import { TrendingUp, TrendingDown, Pause, CheckCircle2, XCircle, ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react';
import type { RankedScreenerResult } from '@/lib/application/screener/types';
import type { SortField, SortDirection } from '@/hooks/use-screener-filters';
import { calculateDistanceToEntryPercent } from '@/lib/application/screener/table-utils';
import { cn } from '@/lib/shared/utils';

interface ScreenerTableProps {
  results: RankedScreenerResult[];
  isLoading: boolean;
  sort: { field: SortField; direction: SortDirection };
  onSort: (field: SortField) => void;
  onRowClick: (result: RankedScreenerResult) => void;
}

/**
 * Full screener table with sortable columns and clickable rows.
 * WAIT is displayed as a valid decision with neutral styling, not as an error.
 */
export function ScreenerTable({ results, isLoading, sort, onSort, onRowClick }: ScreenerTableProps) {
  if (isLoading && results.length === 0) {
    return <TableSkeleton />;
  }

  if (results.length === 0) {
    return (
      <section className="card p-5">
        <NoCleanSetupState />
      </section>
    );
  }

  return (
    <>
      {/* Desktop / tablet: dense table view */}
      <section className="card hidden overflow-hidden md:block">
        <div className="border-b border-border-subtle px-5 py-3 lg:px-6">
          <h2 className="font-[family-name:var(--font-display)] text-sm font-semibold uppercase tracking-wider text-text-muted">
            All Coins
          </h2>
        </div>
        <div className="scroll-x-hint overflow-x-auto">
          <table className="w-full min-w-[900px] text-sm">
            <thead>
              <tr className="border-b border-border-subtle text-left text-xs uppercase tracking-wider text-text-muted">
                <SortableHeader label="Symbol" field="marketCapRank" sort={sort} onSort={onSort} />
                <SortableHeader label="Rank" field="rank" sort={sort} onSort={onSort} />
                <th className="px-4 py-3 font-medium">Action</th>
                <SortableHeader label="Confidence" field="confidence" sort={sort} onSort={onSort} />
                <SortableHeader label="Grade" field="grade" sort={sort} onSort={onSort} />
                <SortableHeader label="Score" field="rankingScore" sort={sort} onSort={onSort} />
                <SortableHeader label="R:R" field="riskReward" sort={sort} onSort={onSort} />
                <th className="px-4 py-3 font-medium">Entry dist.</th>
                <th className="px-4 py-3 font-medium">Regime</th>
                <SortableHeader label="Freshness" field="freshness" sort={sort} onSort={onSort} />
                <th className="px-4 py-3 font-medium">Data</th>
                <th className="px-4 py-3 font-medium">Eligible</th>
              </tr>
            </thead>
            <tbody>
              {results.map((row) => (
                <ScreenerRow key={row.symbol} row={row} onClick={() => onRowClick(row)} />
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Mobile: stacked cards. Each card is a single button so screen
          readers announce a unified "Open detail for X" instead of reading
          11 cells in sequence with no column context. */}
      <section className="space-y-2 md:hidden">
        <h2 className="px-1 font-[family-name:var(--font-display)] text-xs font-semibold uppercase tracking-wider text-text-muted">
          All Coins
        </h2>
        {results.map((row) => (
          <ScreenerMobileCard key={row.symbol} row={row} onClick={() => onRowClick(row)} />
        ))}
      </section>
    </>
  );
}

function SortableHeader({
  label,
  field,
  sort,
  onSort,
}: {
  label: string;
  field: SortField;
  sort: { field: SortField; direction: SortDirection };
  onSort: (field: SortField) => void;
}) {
  const active = sort.field === field;
  return (
    <th className="px-4 py-3 font-medium">
      <button
        onClick={() => onSort(field)}
        className={cn(
          'inline-flex items-center gap-1 rounded transition-colors',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-bg-surface',
          active ? 'text-accent-primary' : 'hover:text-text-primary'
        )}
        aria-label={`Sort by ${label}`}
      >
        {label}
        {active ? (
          sort.direction === 'asc' ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />
        ) : (
          <ChevronsUpDown className="h-3 w-3 opacity-40" />
        )}
      </button>
    </th>
  );
}

function ScreenerRow({ row, onClick }: { row: RankedScreenerResult; onClick: () => void }) {
  return (
    <tr
      className="cursor-pointer border-b border-border-subtle/50 transition-colors hover:bg-bg-surface-raised/50 focus-within:bg-bg-surface-raised/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus-ring"
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } }}
      aria-label={`View details for ${row.symbol}`}
    >
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

      {/* R:R */}
      <td className="px-4 py-3 tabular-nums text-text-primary">
        {row.riskReward != null ? row.riskReward.toFixed(2) : '—'}
      </td>

      {/* Entry distance */}
      <td className="px-4 py-3">
        <EntryDistanceBadge value={calculateDistanceToEntryPercent(row)} />
      </td>

      {/* Regime */}
      <td className="px-4 py-3">
        <span className="text-xs text-text-secondary">{formatRegime(row.marketRegime)}</span>
      </td>

      {/* Freshness */}
      <td className="px-4 py-3">
        <FreshnessBadge ageSec={row.freshness.setupCandleAgeSec} />
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

/**
 * Mobile-friendly card for the screener results.
 *
 * Compact summary of the most important fields (action, confidence, grade,
 * R:R, freshness) with the symbol prominent at the top. The whole card is
 * a single button so screen readers announce a unified "Open detail for X"
 * action instead of reading 11 disconnected cells in sequence.
 */
function ScreenerMobileCard({ row, onClick }: { row: RankedScreenerResult; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'card flex w-full flex-col gap-3 px-4 py-3 text-left transition-colors',
        'hover:border-border-strong hover:bg-bg-surface-raised/40',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-bg-app'
      )}
      aria-label={`Open detail for ${row.symbol}, action ${row.action}, confidence ${row.confidence}`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-baseline gap-2">
          <span className="font-[family-name:var(--font-display)] text-lg font-bold text-text-primary">
            {row.baseAsset}
          </span>
          <span className="text-xs text-text-muted">#{row.marketCapRank ?? '—'}</span>
        </div>
        <ActionBadge action={row.action} />
      </div>

      <div className="grid grid-cols-3 gap-2 text-xs">
        <MobileMetric label="Conf" value={`${row.confidence}`} />
        <MobileMetric
          label="Grade"
          value={<GradeBadge grade={row.grade} />}
          align="left"
        />
        <MobileMetric
          label="R:R"
          value={row.riskReward != null ? row.riskReward.toFixed(2) : '—'}
        />
        <MobileMetric label="Score" value={row.rankingScore.toFixed(1)} />
        <MobileMetric
          label="Entry"
          value={<EntryDistanceBadge value={calculateDistanceToEntryPercent(row)} />}
          align="left"
        />
        <MobileMetric
          label="Fresh"
          value={<FreshnessBadge ageSec={row.freshness.setupCandleAgeSec} />}
          align="left"
        />
        <MobileMetric
          label="Data"
          value={
            row.dataHealth.ok ? (
              <span className="inline-flex items-center gap-1 text-success">
                <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                ok
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-danger">
                <XCircle className="h-3.5 w-3.5" aria-hidden="true" />
                degraded
              </span>
            )
          }
          align="left"
        />
      </div>

      <div className="flex items-center justify-between text-[11px]">
        <span className="text-text-muted">{formatRegime(row.marketRegime)}</span>
        {row.alertEligible ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-success/10 px-2 py-0.5 font-medium text-success">
            Eligible
          </span>
        ) : (
          <span className="text-text-muted">Not eligible</span>
        )}
      </div>
    </button>
  );
}

/** Single label-over-value cell used inside the mobile screener card. */
function MobileMetric({
  label,
  value,
  align = 'left',
}: {
  label: string;
  value: React.ReactNode;
  align?: 'left' | 'right';
}) {
  return (
    <div className={cn('flex flex-col gap-0.5', align === 'right' && 'items-end text-right')}>
      <span className="text-[10px] uppercase tracking-wider text-text-muted">{label}</span>
      <span className="text-sm font-medium tabular-nums text-text-primary">{value}</span>
    </div>
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

function FreshnessBadge({ ageSec }: { ageSec: number | null }) {
  if (ageSec == null) return <span className="text-xs text-text-muted">—</span>;
  const label = ageSec < 60 ? `${ageSec}s` : ageSec < 3600 ? `${Math.round(ageSec / 60)}m` : `${Math.round(ageSec / 3600)}h`;
  const tone = ageSec < 300 ? 'text-success' : ageSec < 1800 ? 'text-warning' : 'text-danger';
  return <span className={cn('text-xs font-medium tabular-nums', tone)}>{label}</span>;
}

function EntryDistanceBadge({ value }: { value: number | null }) {
  if (value == null) return <span className="text-xs text-text-muted">—</span>;

  const abs = Math.abs(value);
  const tone = abs <= 0.5 ? 'text-success' : abs <= 1.5 ? 'text-warning' : 'text-text-muted';
  const prefix = value > 0 ? '+' : '';

  return (
    <span className={cn('text-xs font-medium tabular-nums', tone)} title="Estimated distance to engine entry">
      {prefix}{value.toFixed(2)}%
    </span>
  );
}

function formatRegime(regime: string): string {
  return regime.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * No-clean-setup state. Shown when all results are filtered out or no
 * eligible setups exist. This is NOT an error — it's valid analysis.
 */
function NoCleanSetupState() {
  return (
    <div className="flex items-center gap-4 rounded-lg bg-bg-surface-soft p-5">
      <div className="rounded-full bg-market-neutral/10 p-3">
        <Pause className="h-6 w-6 text-market-neutral" />
      </div>
      <div>
        <h3 className="text-sm font-semibold text-text-primary">No clean setup now</h3>
        <p className="mt-1 text-sm text-text-secondary">
          The market may be weak, conflicting, stale, or below your configured thresholds.
          This is valid analysis — WAIT is a legitimate risk-first decision.
        </p>
      </div>
    </div>
  );
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
            <div className="skeleton h-4 w-10" />
          </div>
        ))}
      </div>
    </section>
  );
}
