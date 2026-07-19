'use client';

import { useQuery } from '@tanstack/react-query';
import type { ActionCallAnalyzeResponse } from '@/types/action-call';

interface UseActionCallParams {
  symbol: string;
  /** Only fetch in technical mode (Action Call is hidden in clean chart mode). */
  isTechnicalMode: boolean;
  multiTimeframe?: boolean;
}

async function fetchActionCall(
  symbol: string,
  multiTimeframe: boolean,
  signal?: AbortSignal
): Promise<ActionCallAnalyzeResponse> {
  const params = new URLSearchParams({ symbol });
  if (!multiTimeframe) params.set('multi_timeframe', 'false');

  const res = await fetch(`/api/action-call?${params.toString()}`, {
    cache: 'no-store',
    signal,
  });
  const json = (await res.json()) as ActionCallAnalyzeResponse & {
    ok?: boolean;
    error?: string;
  };

  if (!res.ok || json.ok === false) {
    throw new Error(json.error ?? `Action call failed: HTTP ${res.status}`);
  }
  return json;
}

/**
 * Fetch the Python Action Call analysis for a coin.
 * Replaces the previous client-side `generateFuturesSignal` path.
 */
export function useActionCall({
  symbol,
  isTechnicalMode,
  multiTimeframe = true,
}: UseActionCallParams) {
  return useQuery({
    queryKey: ['action-call', symbol, multiTimeframe],
    queryFn: ({ signal }) => fetchActionCall(symbol, multiTimeframe, signal),
    enabled: isTechnicalMode && !!symbol,
    staleTime: 60_000,
    refetchInterval: 60_000,
    retry: 1,
  });
}
