'use client';

import { useQuery } from '@tanstack/react-query';
import type { ScreenerLatestRun } from '@/lib/screener/store';
import type {
  ScreenerAlertRecord,
  ScreenerAlertSettings,
} from '@/lib/screener/types';

export interface ScreenerApiPayload {
  ok: boolean;
  latest: ScreenerLatestRun | null;
  settings: ScreenerAlertSettings;
  recentAlerts: ScreenerAlertRecord[];
  error?: string;
}

/**
 * Fetch screener data from the read-only API. The UI never recomputes
 * signals in the browser — it only displays what the worker persisted.
 */
async function fetchScreener(): Promise<ScreenerApiPayload> {
  const res = await fetch('/api/screener', { cache: 'no-store' });
  if (!res.ok) {
    throw new Error(`Failed to fetch screener data: ${res.status}`);
  }
  return res.json();
}

/** React Query hook with sensible polling for the screener. */
export function useScreenerData() {
  return useQuery({
    queryKey: ['screener'],
    queryFn: fetchScreener,
    refetchInterval: 60_000, // Polled minute by minute; worker runs every 15m.
    staleTime: 30_000,
  });
}
