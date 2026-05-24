'use client';

import { useQuery } from '@tanstack/react-query';
import type { ScreenerLatestRun } from '@/lib/application/screener/store';
import type {
  ScreenerAlertRecord,
  ScreenerAlertSettings,
} from '@/lib/application/screener/types';

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
 *
 * Validates the API envelope shape before returning so a malformed response
 * cannot silently drive the UI off-spec.
 */
async function fetchScreener(signal?: AbortSignal): Promise<ScreenerApiPayload> {
  const res = await fetch('/api/screener', { cache: 'no-store', signal });
  if (!res.ok) {
    throw new Error(`Failed to fetch screener data: ${res.status}`);
  }
  const json: unknown = await res.json();
  return assertScreenerPayload(json);
}

/** Narrow validation that the API returned the expected envelope. */
function assertScreenerPayload(value: unknown): ScreenerApiPayload {
  if (!value || typeof value !== 'object') {
    throw new Error('Screener API returned an invalid payload.');
  }
  const obj = value as Record<string, unknown>;
  if (typeof obj.ok !== 'boolean') {
    throw new Error('Screener API payload missing `ok` flag.');
  }
  if (obj.ok === false) {
    const message = typeof obj.error === 'string' && obj.error ? obj.error : 'Screener API returned an error.';
    throw new Error(message);
  }
  if (!('settings' in obj) || !obj.settings || typeof obj.settings !== 'object') {
    throw new Error('Screener API payload missing `settings`.');
  }
  if (!Array.isArray(obj.recentAlerts)) {
    throw new Error('Screener API payload `recentAlerts` is not an array.');
  }
  return obj as unknown as ScreenerApiPayload;
}

/** React Query hook with sensible polling for the screener. */
export function useScreenerData() {
  return useQuery({
    queryKey: ['screener'],
    queryFn: ({ signal }) => fetchScreener(signal),
    refetchInterval: 60_000, // Polled minute by minute; worker runs every 15m.
    staleTime: 30_000,
  });
}
