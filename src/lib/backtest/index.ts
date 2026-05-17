/**
 * Public barrel for the backtest module.
 *
 * Anything not exported here is internal — keep the surface area small so the
 * UI/store and tests have a single, stable import path.
 */

export type {
  BacktestConfig,
  BacktestCosts,
  BacktestMetrics,
  BacktestPerformanceBucket,
  BacktestResult,
  BacktestRunInput,
  BacktestSignal,
  BacktestTrade,
  BacktestTradeStatus,
} from './types';
export { DEFAULT_BACKTEST_CONFIG, DEFAULT_BACKTEST_COSTS } from './types';
export { simulateTrades } from './simulator';
export { computeMetrics, deriveSampleWarnings } from './metrics';
export { runBacktest, type RunBacktestInput } from './runner';
export {
  bullishTrendFixture,
  bearishTrendFixture,
  rangeFixture,
  choppyFixture,
  volatileFixture,
  FIXTURES,
  type FixtureName,
} from './fixtures';
