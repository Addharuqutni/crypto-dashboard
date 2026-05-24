import type { Candle } from '@/types/chart';
import type {
  FuturesDataHealth,
  FuturesSignalConfig,
  FuturesTimeframeHealth,
} from '@/types/futures-signal';
import { DEFAULT_FUTURES_SIGNAL_CONFIG } from '@/types/futures-signal';

/**
 * Data Health Gate.
 *
 * Phase 1 hardening — the first gate the futures decision engine must pass.
 * The gate is intentionally strict: any of the following forces the engine to
 * emit a WAIT outcome with a clear reason instead of a fabricated setup:
 *
 *   1. The symbol is missing/invalid.
 *   2. Any required timeframe (setup/macro/trigger) has too few candles.
 *   3. Any required timeframe's most recent candle is stale (closeTime older
 *      than the configured freshness threshold for that timeframe).
 *   4. The setup timeframe is missing entirely.
 *   5. The 4H (macro) timeframe is missing entirely.
 *   6. Candles are unsorted or contain duplicate/invalid timestamps.
 *
 * Funding rate and open interest are treated as *secondary* data:
 *   - Their absence does NOT force WAIT on its own.
 *   - Instead, the gate caps `confidenceCap` so the engine cannot publish
 *     a high confidence on a setup whose positioning context is unknown.
 *
 * The gate is pure and synchronous. Callers are expected to inject a
 * deterministic `nowMs` for tests; in production it falls back to `Date.now()`.
 */

export interface DataHealthInput {
  symbol: string;
  setupTimeframe: string;
  setupCandles: Candle[];
  macroCandles?: Candle[];
  triggerCandles?: Candle[];
  fundingRate?: number | null;
  fundingRateUpdatedAtMs?: number | null;
  openInterestChangePercent?: number | null;
  openInterestUpdatedAtMs?: number | null;
  /** Reference time in ms; defaults to `Date.now()`. */
  nowMs?: number;
}

const SYMBOL_PATTERN = /^[A-Z0-9]{2,20}$/;

const SECONDS = 1;
const MINUTES = 60 * SECONDS;
const HOURS = 60 * MINUTES;

/**
 * Approximate the timeframe interval in seconds.
 *
 * Accepts the project's chart timeframes (`5m`, `15m`, `30m`, `1H`, `4H`,
 * `24H`, `7D`, `30D`) plus common aliases like `1h`, `4h`, `1d`. Returns
 * `null` for genuinely unknown values so callers can downgrade gracefully.
 */
export function timeframeToSeconds(tf: string): number | null {
  if (!tf) return null;
  const normalized = tf.trim();
  const match = normalized.match(/^(\d+)\s*([mMhHdDwW])$/);
  if (!match) return null;
  const n = Number(match[1]);
  const unit = (match[2] ?? '').toLowerCase();
  if (!Number.isFinite(n) || n <= 0) return null;
  switch (unit) {
    case 'm':
      return n * MINUTES;
    case 'h':
      return n * HOURS;
    case 'd':
      return n * 24 * HOURS;
    case 'w':
      return n * 7 * 24 * HOURS;
    default:
      return null;
  }
}

/**
 * Run the Data Health Gate.
 *
 * Always returns a fully-populated snapshot, even on the failure path. The
 * caller decides what to do with it; this module never throws.
 */
export function evaluateDataHealth(
  input: DataHealthInput,
  config: FuturesSignalConfig = DEFAULT_FUTURES_SIGNAL_CONFIG
): FuturesDataHealth {
  const now = Number.isFinite(input.nowMs) ? Number(input.nowMs) : Date.now();
  const reasons: string[] = [];

  // --- Symbol validation ---
  const symbolProvided = typeof input.symbol === 'string' && input.symbol.length > 0;
  const symbolValid = symbolProvided && SYMBOL_PATTERN.test(input.symbol);
  const symbol = {
    provided: symbolProvided,
    valid: symbolValid,
    reason: symbolProvided
      ? symbolValid
        ? null
        : `Symbol "${input.symbol}" does not match the expected format.`
      : 'Symbol is missing.',
  };
  if (!symbolValid && symbol.reason) reasons.push(symbol.reason);

  // --- Setup timeframe (always required) ---
  const setupSeconds = timeframeToSeconds(input.setupTimeframe);
  const setupMaxAgeSec = setupSeconds
    ? setupSeconds * config.freshnessMultiplier
    : 6 * HOURS; // generous fallback when TF is unknown
  const setupMin = Math.max(
    config.emaLongPeriod,
    2 * config.adxPeriod + 1,
    config.swingLookback + 1
  );
  const setup = evaluateTimeframe({
    label: input.setupTimeframe || 'setup',
    candles: input.setupCandles,
    required: true,
    minRequired: setupMin,
    maxAgeSec: setupMaxAgeSec,
    nowMs: now,
  });
  if (!setup.ok && setup.reason) reasons.push(setup.reason);

  // --- Macro timeframe (4H) — required for directional authority ---
  const macroSeconds = 4 * HOURS;
  const macroMaxAgeSec = macroSeconds * config.freshnessMultiplier;
  const macroMin = Math.max(
    config.emaLongPeriod,
    2 * config.adxPeriod + 1
  );
  const macro = evaluateTimeframe({
    label: '4H macro',
    candles: input.macroCandles,
    required: true,
    minRequired: macroMin,
    maxAgeSec: macroMaxAgeSec,
    nowMs: now,
  });
  if (!macro.ok && macro.reason) reasons.push(macro.reason);

  // --- Trigger timeframe (15m) — required for the trigger-check gate ---
  const triggerSeconds = 15 * MINUTES;
  const triggerMaxAgeSec = triggerSeconds * config.freshnessMultiplier;
  const trigger = evaluateTimeframe({
    label: '15m trigger',
    candles: input.triggerCandles,
    required: true,
    minRequired: config.minTriggerCandles,
    maxAgeSec: triggerMaxAgeSec,
    nowMs: now,
  });
  if (!trigger.ok && trigger.reason) reasons.push(trigger.reason);

  // --- Funding rate (secondary) ---
  const fundingAvailable =
    input.fundingRate != null && Number.isFinite(input.fundingRate);
  const fundingAge = ageSecOrNull(input.fundingRateUpdatedAtMs, now);
  const fundingFresh =
    fundingAvailable && (fundingAge == null || fundingAge <= config.fundingMaxAgeSec);
  const funding = {
    available: fundingAvailable,
    ageSec: fundingAge,
    maxAgeSec: config.fundingMaxAgeSec,
    ok: fundingAvailable && fundingFresh,
  };

  // --- Open interest (secondary) ---
  const oiAvailable =
    input.openInterestChangePercent != null &&
    Number.isFinite(input.openInterestChangePercent);
  const oiAge = ageSecOrNull(input.openInterestUpdatedAtMs, now);
  const oiFresh =
    oiAvailable && (oiAge == null || oiAge <= config.oiMaxAgeSec);
  const openInterest = {
    available: oiAvailable,
    ageSec: oiAge,
    maxAgeSec: config.oiMaxAgeSec,
    ok: oiAvailable && oiFresh,
  };

  // --- Confidence cap ---
  let confidenceCap = 100;
  if (!funding.ok) confidenceCap = Math.min(confidenceCap, 80);
  if (!openInterest.ok) confidenceCap = Math.min(confidenceCap, 75);
  if (!funding.ok && !openInterest.ok) confidenceCap = Math.min(confidenceCap, 70);

  const ok = symbolValid && setup.ok && macro.ok && trigger.ok;

  return {
    ok,
    symbol,
    setup,
    macro,
    trigger,
    funding,
    openInterest,
    reasons,
    confidenceCap,
  };
}

interface TfArgs {
  label: string;
  candles: Candle[] | undefined;
  required: boolean;
  minRequired: number;
  maxAgeSec: number;
  nowMs: number;
}

/**
 * Evaluate a single timeframe slot for count, ordering, and freshness.
 *
 * Validates that candles have monotonically increasing `closeTime` and uses
 * the maximum `closeTime` (not the last array element) for age calculation
 * so unsorted input cannot silently pass the freshness check.
 */
function evaluateTimeframe(args: TfArgs): FuturesTimeframeHealth {
  const candles = args.candles ?? [];
  const count = candles.length;

  if (count === 0) {
    return {
      required: args.required,
      candleCount: 0,
      minCandlesRequired: args.minRequired,
      lastCandleAgeSec: null,
      maxAgeSec: args.maxAgeSec,
      ok: false,
      reason: `${args.label}: no candles available.`,
    };
  }

  // Validate candle timestamps are finite and monotonically increasing.
  let maxCloseTime = -Infinity;
  let prevCloseTime = -Infinity;
  let isMonotonic = true;

  for (let i = 0; i < count; i++) {
    const c = candles[i]!;
    if (!Number.isFinite(c.closeTime) || !Number.isFinite(c.openTime)) {
      return {
        required: args.required,
        candleCount: count,
        minCandlesRequired: args.minRequired,
        lastCandleAgeSec: null,
        maxAgeSec: args.maxAgeSec,
        ok: false,
        reason: `${args.label}: candle at index ${i} has invalid timestamp.`,
      };
    }
    if (c.closeTime <= prevCloseTime) isMonotonic = false;
    if (c.closeTime > maxCloseTime) maxCloseTime = c.closeTime;
    prevCloseTime = c.closeTime;
  }

  if (!isMonotonic) {
    return {
      required: args.required,
      candleCount: count,
      minCandlesRequired: args.minRequired,
      lastCandleAgeSec: null,
      maxAgeSec: args.maxAgeSec,
      ok: false,
      reason: `${args.label}: candles are not sorted by closeTime (unsorted or duplicates detected).`,
    };
  }

  if (count < args.minRequired) {
    const lastAgeSec = Math.max(0, Math.floor((args.nowMs - maxCloseTime) / 1000));
    return {
      required: args.required,
      candleCount: count,
      minCandlesRequired: args.minRequired,
      lastCandleAgeSec: lastAgeSec,
      maxAgeSec: args.maxAgeSec,
      ok: false,
      reason: `${args.label}: only ${count}/${args.minRequired} candles available.`,
    };
  }

  // Use max closeTime for freshness — safe even if array were somehow unsorted.
  const lastAgeSec = Math.max(0, Math.floor((args.nowMs - maxCloseTime) / 1000));

  if (lastAgeSec > args.maxAgeSec) {
    return {
      required: args.required,
      candleCount: count,
      minCandlesRequired: args.minRequired,
      lastCandleAgeSec: lastAgeSec,
      maxAgeSec: args.maxAgeSec,
      ok: false,
      reason: `${args.label}: latest candle is ${formatAge(lastAgeSec)} old (max ${formatAge(args.maxAgeSec)}).`,
    };
  }

  return {
    required: args.required,
    candleCount: count,
    minCandlesRequired: args.minRequired,
    lastCandleAgeSec: lastAgeSec,
    maxAgeSec: args.maxAgeSec,
    ok: true,
    reason: null,
  };
}

/** Compute age in seconds from an optional ms timestamp. Returns null if unknown. */
function ageSecOrNull(ts: number | null | undefined, nowMs: number): number | null {
  if (ts == null || !Number.isFinite(ts)) return null;
  return Math.max(0, Math.floor((nowMs - ts) / 1000));
}

/** Format an age (seconds) as a short human-friendly string. */
function formatAge(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.round(seconds / 3600)}h`;
  return `${Math.round(seconds / 86400)}d`;
}
