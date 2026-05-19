import type { fetchKlines } from '@/lib/adapters/binance';
import type { fetchFundingRate } from '@/lib/adapters/api/binance-funding-rate';
import type { fetchOpenInterestSnapshot } from '@/lib/adapters/api/binance-open-interest';
import type { generateFuturesSignal } from '@/lib/domain/analysis/futures-signal-engine';

/**
 * Screener ports — the explicit boundary between the screener use case
 * and the outside world.
 *
 * These types are derived from the concrete adapter signatures rather than
 * hand-rolled interfaces so the use case stays a drop-in replacement for
 * the previous procedural runner. The hexagonal-architecture intent is
 * still preserved: the use case depends on these types, not the modules
 * that implement them.
 */

export type FuturesKlinesPort = typeof fetchKlines;
export type FundingRatePort = typeof fetchFundingRate;
export type OpenInterestPort = typeof fetchOpenInterestSnapshot;
export type SignalEnginePort = typeof generateFuturesSignal;

/** Trivial clock port. Kept narrow on purpose so tests can pin time. */
export type ClockPort = () => number;

/**
 * Aggregated dependencies a `RunScreenerCycle` use case needs.
 *
 * All fields are optional so the production composition root can pass `{}`
 * and let the default adapters be used. Tests can mock any subset.
 */
export interface ScreenerCyclePorts {
  fetchKlines?: FuturesKlinesPort;
  fetchFundingRate?: FundingRatePort;
  fetchOpenInterest?: OpenInterestPort;
  signalEngine?: SignalEnginePort;
  now?: ClockPort;
}
