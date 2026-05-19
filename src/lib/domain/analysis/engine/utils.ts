/**
 * Numeric helpers shared by the futures decision engine.
 *
 * Kept tiny and dependency-free so scoring, wait-signal builders, and the
 * pipeline can all share the same bounds-clamp without duplicating logic.
 */

/**
 * Clamp a number to `[min, max]`.
 *
 * Non-finite inputs (`NaN`, `Infinity`) fall back to `min` so callers never
 * propagate dirty values into score breakdowns or signal payloads.
 */
export function clamp(v: number, min: number, max: number): number {
  if (!Number.isFinite(v)) return min;
  if (v < min) return min;
  if (v > max) return max;
  return v;
}
