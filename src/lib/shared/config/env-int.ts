/**
 * Bounded integer parsing for configuration values.
 *
 * This module exists because the same helper had been copy-pasted into five
 * places under four different names — and, worse, the copies disagreed. Four
 * used `Number.parseInt(raw, 10)`; one used `Number(raw)`. That is not a
 * cosmetic difference:
 *
 *   raw       parseInt   Number
 *   '1e3'     1          1000      <- a 1000x silent misread
 *   '0x10'    0          16        <- reads as 0, clamped up to min
 *   '30abc'   30         30 -> NaN <- garbage silently accepted as 30
 *   '3.5'     3          3.5
 *
 * Neither parser is safe by accident, so this one is safe on purpose: only a
 * plain decimal literal is accepted, and anything else falls back. A config
 * value that is misspelled should keep the documented default, not become a
 * different number.
 */

/** Accepts an optional sign, digits, and an optional fractional part. */
const DECIMAL_LITERAL = /^[+-]?\d+(?:\.\d+)?$/;

/**
 * Parse an untrusted string into an integer clamped to `[min, max]`.
 *
 * Returns `fallback` when the input is absent, blank, or not a plain decimal
 * literal. Fractional input is truncated toward zero, matching the previous
 * `parseInt` behaviour for values like `'3.5'`.
 */
export function parseBoundedInt(
  raw: string | null | undefined,
  fallback: number,
  min: number,
  max: number
): number {
  const trimmed = raw?.trim();
  if (!trimmed || !DECIMAL_LITERAL.test(trimmed)) return fallback;

  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed)) return fallback;

  return Math.min(max, Math.max(min, Math.trunc(parsed)));
}

/**
 * Read a bounded integer from the environment.
 *
 * `env` is injectable so callers that already thread a config record through
 * (the worker) can pass it, and so tests need not mutate `process.env`.
 */
export function readEnvInt(
  name: string,
  fallback: number,
  min: number,
  max: number,
  env: Record<string, string | undefined> = process.env
): number {
  return parseBoundedInt(env[name], fallback, min, max);
}
