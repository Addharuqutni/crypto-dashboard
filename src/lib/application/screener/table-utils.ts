import type { RankedScreenerResult } from '@/lib/application/screener/types';
import type { FuturesGrade, FuturesSignalAction } from '@/types/futures-signal';

export type ActionFilter = 'ALL' | FuturesSignalAction;
export type GradeFilter = 'ALL' | FuturesGrade;
export type DataFilter = 'all' | 'healthy' | 'degraded';

export type SortField =
  | 'rank'
  | 'confidence'
  | 'grade'
  | 'riskReward'
  | 'freshness'
  | 'marketCapRank'
  | 'rankingScore';

export type SortDirection = 'asc' | 'desc';

export interface ScreenerFilters {
  action: ActionFilter;
  grade: GradeFilter;
  minConfidence: number;
  eligibleOnly: boolean;
  dataFilter: DataFilter;
}

export interface ScreenerSort {
  field: SortField;
  direction: SortDirection;
}

export const DEFAULT_SCREENER_FILTERS: ScreenerFilters = {
  action: 'ALL',
  grade: 'ALL',
  minConfidence: 0,
  eligibleOnly: false,
  dataFilter: 'all',
};

export const DEFAULT_SCREENER_SORT: ScreenerSort = {
  field: 'rank',
  direction: 'asc',
};

const GRADE_ORDER: Record<string, number> = { A: 0, B: 1, C: 2, D: 3 };

/**
 * Filter persisted screener results by table controls.
 * Does not recompute signals; it only narrows stored ranked results.
 */
export function filterScreenerResults(
  results: RankedScreenerResult[],
  filters: ScreenerFilters
): RankedScreenerResult[] {
  return results.filter((r) => {
    if (filters.action !== 'ALL' && r.action !== filters.action) return false;
    if (filters.grade !== 'ALL' && r.grade !== filters.grade) return false;
    if (r.confidence < filters.minConfidence) return false;
    if (filters.eligibleOnly && !r.alertEligible) return false;
    if (filters.dataFilter === 'healthy' && !r.dataHealth.ok) return false;
    if (filters.dataFilter === 'degraded' && r.dataHealth.ok) return false;
    return true;
  });
}

/**
 * Sort persisted screener results by the selected table column.
 * Rank, grade, freshness, and market cap sort best-to-worst ascending by default.
 */
export function sortScreenerResults(
  results: RankedScreenerResult[],
  sort: ScreenerSort
): RankedScreenerResult[] {
  const arr = [...results];
  const dir = sort.direction === 'asc' ? 1 : -1;

  arr.sort((a, b) => {
    let cmp = 0;
    switch (sort.field) {
      case 'rank':
        cmp = compareRank(a.rank, b.rank);
        break;
      case 'confidence':
        cmp = a.confidence - b.confidence;
        break;
      case 'grade':
        cmp = (GRADE_ORDER[a.grade] ?? 4) - (GRADE_ORDER[b.grade] ?? 4);
        break;
      case 'riskReward':
        cmp = (a.riskReward ?? 0) - (b.riskReward ?? 0);
        break;
      case 'freshness':
        cmp = (a.freshness.setupCandleAgeSec ?? 9999) - (b.freshness.setupCandleAgeSec ?? 9999);
        break;
      case 'marketCapRank':
        cmp = (a.marketCapRank ?? 999) - (b.marketCapRank ?? 999);
        break;
      case 'rankingScore':
        cmp = a.rankingScore - b.rankingScore;
        break;
    }
    return cmp * dir;
  });

  return arr;
}

/** Count active filters so the UI can show a compact filter badge. */
export function countActiveScreenerFilters(filters: ScreenerFilters): number {
  let count = 0;
  if (filters.action !== 'ALL') count++;
  if (filters.grade !== 'ALL') count++;
  if (filters.minConfidence > 0) count++;
  if (filters.eligibleOnly) count++;
  if (filters.dataFilter !== 'all') count++;
  return count;
}

/** Compare ranks where 0 means unranked (pushed to bottom). */
function compareRank(a: number, b: number): number {
  if (a === 0 && b === 0) return 0;
  if (a === 0) return 1;
  if (b === 0) return -1;
  return a - b;
}
