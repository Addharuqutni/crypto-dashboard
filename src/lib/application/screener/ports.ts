import type { ActionCallView } from '@/types/action-call';

/** Analyze one symbol via the Python Action Call service. */
export type AnalyzeSymbolPort = (symbol: string) => Promise<ActionCallView>;

/** Trivial clock port. Kept narrow on purpose so tests can pin time. */
type ClockPort = () => number;

/**
 * Aggregated dependencies a `RunScreenerCycle` use case needs.
 *
 * All fields are optional so the production composition root can pass `{}`
 * and let the default adapters be used. Tests can mock any subset.
 */
export interface ScreenerCyclePorts {
  analyzeSymbol?: AnalyzeSymbolPort;
  now?: ClockPort;
}
