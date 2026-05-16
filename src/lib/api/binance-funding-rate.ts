/**
 * Binance USDⓈ-M Futures funding rate adapter.
 *
 * Endpoint: GET /fapi/v1/premiumIndex?symbol={SYMBOL}
 *   - returns lastFundingRate, markPrice, nextFundingTime, etc.
 *   - lightweight, no auth required.
 *
 * Adapter pattern matches `binance-futures-client.ts`: timeout-protected,
 * graceful failure, and a clean parsed result with `null` on missing data.
 */

const BASE = 'https://fapi.binance.com/fapi/v1';
const TIMEOUT_MS = 5000;

interface PremiumIndexResponse {
  symbol: string;
  markPrice: string;
  indexPrice: string;
  estimatedSettlePrice: string;
  lastFundingRate: string;
  nextFundingTime: number;
  interestRate: string;
  time: number;
}

export interface FundingRateSnapshot {
  /** Last funding rate as a decimal (e.g. 0.0001 = 0.01%). */
  lastFundingRate: number;
  /** Epoch ms of the next funding settlement. */
  nextFundingTime: number;
}

/**
 * Fetch the latest funding rate for one Binance Futures symbol.
 * Returns `null` on any failure — callers degrade gracefully.
 */
export async function fetchFundingRate(
  binanceSymbol: string
): Promise<FundingRateSnapshot | null> {
  if (!binanceSymbol) return null;

  const url = `${BASE}/premiumIndex?symbol=${encodeURIComponent(binanceSymbol)}`;
  try {
    const response = await fetchWithTimeout(url, TIMEOUT_MS);
    if (!response.ok) return null;
    const data = (await response.json()) as PremiumIndexResponse;

    const rate = parseFloat(data.lastFundingRate);
    if (!Number.isFinite(rate)) return null;

    return {
      lastFundingRate: rate,
      nextFundingTime: typeof data.nextFundingTime === 'number' ? data.nextFundingTime : 0,
    };
  } catch {
    return null;
  }
}

/**

 * Mengambil with timeout dari sumber data terkait.

 * Dipakai untuk memisahkan akses data dari komponen dan logic domain.

 */

async function fetchWithTimeout(url: string, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(t);
  }
}
