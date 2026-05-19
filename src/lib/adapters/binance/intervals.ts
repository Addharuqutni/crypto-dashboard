/**
 * Canonical Binance kline interval strings used across the app.
 *
 * Centralized here so worker, screener, and any future Binance-driven
 * consumer share one definition. Previously this lived in
 * `lib/application/worker/types.ts` as `WorkerInterval`, which caused
 * cross-feature imports between screener and worker.
 */
export type BinanceInterval = '5m' | '15m' | '30m' | '1h' | '2h' | '4h' | '1d';

/** Runtime list of accepted intervals — useful for validation/parsing. */
export const BINANCE_INTERVALS: ReadonlyArray<BinanceInterval> = [
  '5m',
  '15m',
  '30m',
  '1h',
  '2h',
  '4h',
  '1d',
];
