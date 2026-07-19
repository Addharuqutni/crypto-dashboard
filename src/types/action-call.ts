/**
 * Python Action Call types.
 *
 * The Python agent is the sole signal authority. Its `/api/v1/analyze` endpoint
 * returns a dashboard-compatible `signal` object that extends the historical
 * FuturesSignal shape so screener/worker/UI can keep shared grade/regime types
 * without depending on the deleted TypeScript V2 engine.
 */

import type { FuturesSignal } from '@/types/signal-core';

export type ActionCallStatus = 'READY' | 'WAIT_CONFIRMATION' | 'HOLD';

/**
 * UI + worker facing signal. Produced by Python `signal_service._to_dashboard_signal`.
 */
export type ActionCallView = FuturesSignal & {
  /** Python action-call status (READY / WAIT_CONFIRMATION) or HOLD when no call. */
  status: ActionCallStatus;
  /** Raw Python signal label (TREND_LONG, HOLD, …). */
  signal: string;
  bias: string;
  trend: string;
  timeframe?: string;
  sourceEngine?: string;
  pythonSignal?: string | null;
  pythonStatus?: string | null;
  pythonBias?: string | null;
  pythonTrend?: string | null;
};

export interface ActionCallAnalyzeResponse {
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

export interface ActionCallListResponse {
  ok: boolean;
  source?: string;
  count: number;
  items: Array<Record<string, unknown>>;
}

export interface ActionCallScanResponse {
  ok: boolean;
  source?: string;
  count?: number;
  results?: ActionCallAnalyzeResponse[];
  started?: boolean;
  message?: string;
  error?: string | null;
}
