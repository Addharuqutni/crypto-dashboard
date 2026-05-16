/**
 * Binance USDⓈ-M Futures open interest adapter.
 *
 * Endpoints used:
 *   - GET /fapi/v1/openInterest?symbol={SYMBOL}
 *       returns the latest absolute openInterest value
 *   - GET /futures/data/openInterestHist?symbol={SYMBOL}&period=1h&limit=2
 *       returns recent OI snapshots with sumOpenInterestValue
 *
 * `fetchOpenInterestSnapshot` is the convenience wrapper that returns the
 * recent % change in OI (1h window by default), which is what the open
 * interest filter actually consumes.
 */

const BASE = 'https://fapi.binance.com';
const TIMEOUT_MS = 5000;

export interface OpenInterestSnapshot {
  /** Latest absolute open interest. */
  current: number;
  /** Previous OI sample value (period earlier). */
  previous: number | null;
  /** % change between previous and current; null if previous is missing. */
  changePercent: number | null;
  /** Period used for the change ('5m', '15m', '30m', '1h', etc). */
  period: string;
}

interface OpenInterestHistItem {
  symbol: string;
  sumOpenInterest: string;
  sumOpenInterestValue: string;
  timestamp: number;
}

/**
 * Fetch a 2-point OI history sample so a % change can be derived.
 * Default period is `'1h'` which matches typical futures decision windows.
 *
 * Returns `null` on failure. Returns `previous=null, changePercent=null`
 * if Binance only returns a single sample.
 */
export async function fetchOpenInterestSnapshot(
  binanceSymbol: string,
  period = '1h'
): Promise<OpenInterestSnapshot | null> {
  if (!binanceSymbol) return null;

  const url = `${BASE}/futures/data/openInterestHist?symbol=${encodeURIComponent(
    binanceSymbol
  )}&period=${encodeURIComponent(period)}&limit=2`;

  try {
    const response = await fetchWithTimeout(url, TIMEOUT_MS);
    if (!response.ok) return null;
    const data = (await response.json()) as OpenInterestHistItem[];

    if (!Array.isArray(data) || data.length === 0) return null;

    // History is returned oldest → newest.
    const latest = data[data.length - 1];
    const prior = data.length >= 2 ? data[0] : null;
    if (!latest) return null;

    const current = parseFloat(latest.sumOpenInterest);
    if (!Number.isFinite(current)) return null;

    const previous = prior ? parseFloat(prior.sumOpenInterest) : null;
    const changePercent =
      previous != null && Number.isFinite(previous) && previous > 0
        ? ((current - previous) / previous) * 100
        : null;

    return {
      current,
      previous,
      changePercent,
      period,
    };
  } catch {
    return null;
  }
}

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
