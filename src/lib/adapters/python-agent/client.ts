/**
 * Thin HTTP client for the Python Action Call agent.
 * Server-side only — do not import from client components.
 */

import type {
  ActionCallAnalyzeResponse,
  ActionCallListResponse,
  ActionCallScanResponse,
  ActionCallView,
} from '@/types/action-call';

const DEFAULT_BASE = 'http://127.0.0.1:8000';
const DEFAULT_TIMEOUT_MS = 20_000;

export class PythonAgentError extends Error {
  readonly status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.name = 'PythonAgentError';
    if (status !== undefined) this.status = status;
  }
}

/** Raw analyze payload returned by `/api/v1/analyze`. */
export interface PythonAnalyzeResponse {
  ok: boolean;
  source?: string;
  analysisMode?: string;
  symbol: string;
  baseAsset?: string;
  timeframe?: string;
  analysis?: Record<string, unknown> | null;
  actionCall?: Record<string, unknown> | null;
  signal?: ActionCallView | null;
  error?: string | null;
}

/** Bulk scan payload returned by `POST /api/v1/scan`. */
export interface PythonScanResponse {
  ok: boolean;
  source?: string;
  count?: number;
  results: PythonAnalyzeResponse[];
  error?: string | null;
}

function agentBaseUrl(): string {
  return (process.env.PYTHON_AGENT_URL ?? DEFAULT_BASE).replace(/\/$/, '');
}

function agentTimeoutMs(): number {
  const raw = process.env.PYTHON_AGENT_TIMEOUT_MS;
  const n = raw ? Number(raw) : DEFAULT_TIMEOUT_MS;
  return Number.isFinite(n) && n >= 1000 ? n : DEFAULT_TIMEOUT_MS;
}

async function agentFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const url = `${agentBaseUrl()}${path}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), agentTimeoutMs());

  try {
    const headers = new Headers(init?.headers);
    const internalToken = process.env.PYTHON_AGENT_INTERNAL_TOKEN?.trim();
    if (internalToken && !headers.has('X-Internal-Token')) {
      headers.set('X-Internal-Token', internalToken);
    }
    if (!headers.has('Accept')) headers.set('Accept', 'application/json');
    if (init?.body && !headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }

    const res = await fetch(url, {
      ...init,
      headers,
      signal: controller.signal,
      cache: 'no-store',
    });

    if (!res.ok) {
      let detail = `HTTP ${res.status}`;
      try {
        const body = (await res.json()) as { detail?: string; error?: string };
        detail = body.detail ?? body.error ?? detail;
      } catch {
        // ignore parse errors
      }
      throw new PythonAgentError(`Python agent error: ${detail}`, res.status);
    }

    return (await res.json()) as T;
  } catch (err) {
    if (err instanceof PythonAgentError) throw err;
    if ((err as Error)?.name === 'AbortError') {
      throw new PythonAgentError(`Python agent timeout after ${agentTimeoutMs()}ms`);
    }
    throw new PythonAgentError(
      `Python agent unreachable at ${agentBaseUrl()}: ${(err as Error)?.message ?? 'unknown'}`
    );
  } finally {
    clearTimeout(timeout);
  }
}

/** Live analyze one symbol via Python Action Call (MTF by default). */
export async function analyzeActionCall(
  symbol: string,
  options: { multiTimeframe?: boolean } = {}
): Promise<ActionCallAnalyzeResponse> {
  const params = new URLSearchParams({ symbol });
  if (options.multiTimeframe === false) params.set('multi_timeframe', 'false');
  return agentFetch<ActionCallAnalyzeResponse>(`/api/v1/analyze?${params.toString()}`);
}

/** Alias used by screener / worker. */
export async function fetchPythonActionCall(
  symbol: string,
  options: { multiTimeframe?: boolean } = {}
): Promise<PythonAnalyzeResponse> {
  return analyzeActionCall(symbol, options) as Promise<PythonAnalyzeResponse>;
}

/** Bulk scan a list of symbols (or full universe when omitted). */
export async function fetchPythonScan(
  symbols?: string[],
  options: { multiTimeframe?: boolean } = {}
): Promise<PythonScanResponse> {
  return agentFetch<PythonScanResponse>('/api/v1/scan', {
    method: 'POST',
    body: JSON.stringify({
      ...(symbols ? { symbols } : {}),
      multi_timeframe: options.multiTimeframe !== false,
    }),
  });
}

export async function listActionCalls(limit = 200): Promise<ActionCallListResponse> {
  return agentFetch<ActionCallListResponse>(
    `/api/v1/action-calls/latest?limit=${Math.max(1, Math.min(limit, 1000))}`
  );
}

export interface PythonScreenerLatestResponse {
  ok: boolean;
  latest: Record<string, unknown> | null;
}

export interface PythonScreenerRunResponse extends PythonScreenerLatestResponse {
  error?: string;
}

export async function fetchPythonScreenerLatest(): Promise<PythonScreenerLatestResponse> {
  return agentFetch<PythonScreenerLatestResponse>('/api/v1/screener/latest');
}

export async function runPythonScreener(symbols?: string[]): Promise<PythonScreenerRunResponse> {
  const response = await agentFetch<PythonScreenerRunResponse>('/api/v1/screener/run', {
    method: 'POST',
    body: JSON.stringify(symbols ? { symbols } : {}),
  });
  if (!response.ok || !response.latest || typeof response.latest !== 'object') {
    throw new PythonAgentError('Python screener returned an invalid response');
  }
  return response;
}

export async function triggerActionCallScan(): Promise<ActionCallScanResponse> {
  return agentFetch<ActionCallScanResponse>('/api/v1/scan', {
    method: 'POST',
    body: JSON.stringify({ multi_timeframe: true }),
  });
}
