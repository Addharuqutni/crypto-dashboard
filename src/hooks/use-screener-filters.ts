'use client';

import { useState, useMemo, useCallback } from 'react';
import type { RankedScreenerResult } from '@/lib/application/screener/types';
import type { RiskProfile } from '@/types/intelligence';
import {
  DEFAULT_SCREENER_FILTERS,
  DEFAULT_SCREENER_SORT,
  countActiveScreenerFilters,
  filterScreenerResults,
  sortScreenerResults,
  type ActionFilter,
  type DataFilter,
  type GradeFilter,
  type ScreenerFilters,
  type ScreenerSort,
  type SortDirection,
  type SortField,
} from '@/lib/application/screener/table-utils';

export type {
  ActionFilter,
  DataFilter,
  GradeFilter,
  ScreenerFilters,
  ScreenerSort,
  SortDirection,
  SortField,
};

/**
 * Hook managing filter and sort state for the screener table.
 * Pure client-side filtering/sorting of persisted results — no recomputation.
 */
export function useScreenerFilters(results: RankedScreenerResult[], riskProfile?: RiskProfile) {
  const [filters, setFilters] = useState<ScreenerFilters>(DEFAULT_SCREENER_FILTERS);
  const [sort, setSort] = useState<ScreenerSort>(DEFAULT_SCREENER_SORT);

  const filtered = useMemo(
    () => sortScreenerResults(filterScreenerResults(results, filters, riskProfile), sort),
    [results, filters, riskProfile, sort]
  );

  const updateFilter = useCallback(<K extends keyof ScreenerFilters>(
    key: K,
    value: ScreenerFilters[K]
  ) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  }, []);

  const toggleSort = useCallback((field: SortField) => {
    setSort((prev) => {
      if (prev.field === field) {
        return { field, direction: prev.direction === 'asc' ? 'desc' : 'asc' };
      }
      const defaultDir: SortDirection =
        field === 'rank' || field === 'grade' || field === 'freshness' || field === 'marketCapRank'
          ? 'asc'
          : 'desc';
      return { field, direction: defaultDir };
    });
  }, []);

  const resetFilters = useCallback(() => setFilters(DEFAULT_SCREENER_FILTERS), []);

  const activeFilterCount = useMemo(() => countActiveScreenerFilters(filters), [filters]);

  return {
    filters,
    sort,
    filtered,
    totalCount: results.length,
    filteredCount: filtered.length,
    activeFilterCount,
    updateFilter,
    toggleSort,
    resetFilters,
  };
}
