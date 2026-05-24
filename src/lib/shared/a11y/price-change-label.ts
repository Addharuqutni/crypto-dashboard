import { formatPercentageMagnitude } from '@/lib/shared/formatting';

/**
 * Build an accessible label for a 24-hour price change cell.
 *
 * Centralised so every consumer pairs the directional word ("up"/"down"/
 * "unchanged") with an unsigned magnitude. This avoids screen readers
 * announcing "down +2.50%" or "up -1.10%". When the value is missing or
 * non-finite (e.g. division-by-zero upstream produced Infinity) we surface
 * the absence explicitly instead of synthesising a "0.00%" or "Infinity%"
 * reading.
 *
 * `subject` is whatever the cell describes — a coin symbol, a card label
 * like "Total P/L", or any human-readable identifier.
 */
export function buildPriceChangeAriaLabel(subject: string, value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) {
    return `${subject} 24-hour change unavailable`;
  }

  const direction = value > 0 ? 'up' : value < 0 ? 'down' : 'unchanged';
  return `${subject} ${direction} ${formatPercentageMagnitude(value)}`;
}
