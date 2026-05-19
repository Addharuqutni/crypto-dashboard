/**
 * Public barrel for the worker module.
 *
 * Anything not exported here is internal. The CLI entrypoint imports only
 * what it needs from this barrel; the unit tests do the same.
 */

export type {
  AlertDecision,
  AlertDecisionReason,
  AlertDedupeRecord,
  AlertDedupeState,
  EvaluationResult,
  WorkerConfig,
  WorkerHealth,
  WorkerInterval,
  WorkerSignalLogEntry,
} from './types';

export { fetchKlines, KlineFetchError } from '@/lib/adapters/binance';
export {
  loadWorkerConfig,
  validateWorkerConfig,
  hasTelegramCredentials,
  DEFAULT_WORKER_CONFIG,
} from './config';
export { decide, decideHealthAlert, makeKey, makeRecord } from './dedupe';
export { formatTradeAlert, formatHealthAlert } from './formatter';
export {
  defaultHealth,
  recordAlert,
  truncateError,
  WorkerStore,
} from './store';
export {
  sendTelegramMessage,
  TelegramDeliveryError,
  type TelegramDeliveryResult,
} from './telegram';
export { runCycle, type RunCycleDeps, type RunCycleResult } from './runner';
