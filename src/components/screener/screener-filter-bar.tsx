'use client';

import { Filter, RotateCcw } from 'lucide-react';
import type {
  ActionFilter,
  DataFilter,
  GradeFilter,
  ScreenerFilters,
} from '@/hooks/use-screener-filters';
import { cn } from '@/lib/shared/utils';

interface ScreenerFilterBarProps {
  filters: ScreenerFilters;
  totalCount: number;
  filteredCount: number;
  activeFilterCount: number;
  onFilterChange: <K extends keyof ScreenerFilters>(key: K, value: ScreenerFilters[K]) => void;
  onReset: () => void;
}

const ACTION_OPTIONS: { value: ActionFilter; label: string }[] = [
  { value: 'ALL', label: 'All' },
  { value: 'LONG', label: 'Long' },
  { value: 'SHORT', label: 'Short' },
  { value: 'WAIT', label: 'Wait' },
];

const GRADE_OPTIONS: { value: GradeFilter; label: string }[] = [
  { value: 'ALL', label: 'All' },
  { value: 'A', label: 'A' },
  { value: 'B', label: 'B' },
  { value: 'C', label: 'C' },
  { value: 'D', label: 'D' },
];

const DATA_OPTIONS: { value: DataFilter; label: string }[] = [
  { value: 'all', label: 'All data' },
  { value: 'healthy', label: 'Healthy' },
  { value: 'degraded', label: 'Degraded' },
];

/**
 * Filter bar for the screener table. Provides action, grade, confidence,
 * eligible-only, and data health filters.
 */
export function ScreenerFilterBar({
  filters,
  totalCount,
  filteredCount,
  activeFilterCount,
  onFilterChange,
  onReset,
}: ScreenerFilterBarProps) {
  return (
    <div className="card overflow-hidden">
      <div className="flex flex-wrap items-center gap-3 px-4 py-3 lg:px-5">
        {/* Filter icon + count */}
        <div className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-text-muted">
          <Filter className="h-3.5 w-3.5" />
          Filters
          {activeFilterCount > 0 && (
            <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-accent-primary px-1 text-[10px] font-bold text-bg-app">
              {activeFilterCount}
            </span>
          )}
        </div>

        {/* Action */}
        <FilterGroup label="Action">
          {ACTION_OPTIONS.map(({ value, label }) => (
            <FilterChip
              key={value}
              active={filters.action === value}
              onClick={() => onFilterChange('action', value)}
              tone={
                value === 'LONG' ? 'up' :
                value === 'SHORT' ? 'down' :
                value === 'WAIT' ? 'neutral' : undefined
              }
            >
              {label}
            </FilterChip>
          ))}
        </FilterGroup>

        {/* Grade */}
        <FilterGroup label="Grade">
          {GRADE_OPTIONS.map(({ value, label }) => (
            <FilterChip
              key={value}
              active={filters.grade === value}
              onClick={() => onFilterChange('grade', value)}
            >
              {label}
            </FilterChip>
          ))}
        </FilterGroup>

        {/* Data */}
        <FilterGroup label="Data">
          {DATA_OPTIONS.map(({ value, label }) => (
            <FilterChip
              key={value}
              active={filters.dataFilter === value}
              onClick={() => onFilterChange('dataFilter', value)}
            >
              {label}
            </FilterChip>
          ))}
        </FilterGroup>

        {/* Confidence slider — wrapped in <label> for explicit association.
            Inner flex enforces a min-44px tap target per WCAG 2.5.5. */}
        <label className="flex min-h-[44px] items-center gap-2">
          <span className="mr-1 text-[10px] uppercase tracking-wider text-text-muted">
            Min conf
          </span>
          <input
            type="range"
            min={0}
            max={100}
            step={5}
            value={filters.minConfidence}
            onChange={(e) => onFilterChange('minConfidence', Number(e.target.value))}
            className="h-2 w-24 cursor-pointer accent-accent-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-bg-surface"
            aria-valuetext={
              filters.minConfidence > 0 ? `${filters.minConfidence}%` : 'no minimum'
            }
          />
          <span className="w-8 text-right text-xs tabular-nums text-text-primary" aria-hidden="true">
            {filters.minConfidence > 0 ? `${filters.minConfidence}%` : '—'}
          </span>
        </label>

        {/* Eligible only */}
        <label className="flex cursor-pointer items-center gap-1.5 text-xs text-text-secondary">
          <input
            type="checkbox"
            checked={filters.eligibleOnly}
            onChange={(e) => onFilterChange('eligibleOnly', e.target.checked)}
            className="h-3.5 w-3.5 rounded border-border-strong accent-accent-primary"
          />
          Alert eligible
        </label>

        {/* Profile eligible only */}
        <label className="flex cursor-pointer items-center gap-1.5 text-xs text-text-secondary">
          <input
            type="checkbox"
            checked={filters.profileEligibleOnly}
            onChange={(e) => onFilterChange('profileEligibleOnly', e.target.checked)}
            className="h-3.5 w-3.5 rounded border-border-strong accent-accent-primary"
          />
          Profile eligible
        </label>

        {/* Spacer + results count + reset */}
        <div className="ml-auto flex items-center gap-3">
          <span className="text-xs tabular-nums text-text-muted">
            {filteredCount}/{totalCount}
          </span>
          {activeFilterCount > 0 && (
            <button
              onClick={onReset}
              className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-text-secondary transition-colors hover:bg-bg-surface-raised hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
              aria-label="Reset all filters"
            >
              <RotateCcw className="h-3 w-3" />
              Reset
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function FilterGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-1">
      <span className="mr-1 text-[10px] uppercase tracking-wider text-text-muted">{label}</span>
      {children}
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  children,
  tone,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  tone?: 'up' | 'down' | 'neutral';
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'rounded-md px-2 py-0.5 text-xs font-medium transition-all',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-bg-surface',
        active
          ? tone === 'up'
            ? 'bg-market-up/15 text-market-up ring-1 ring-market-up/30'
            : tone === 'down'
              ? 'bg-market-down/15 text-market-down ring-1 ring-market-down/30'
              : tone === 'neutral'
                ? 'bg-market-neutral/15 text-market-neutral ring-1 ring-market-neutral/30'
                : 'bg-accent-primary/15 text-accent-primary ring-1 ring-accent-primary/30'
          : 'text-text-secondary hover:bg-bg-surface-raised hover:text-text-primary'
      )}
    >
      {children}
    </button>
  );
}
