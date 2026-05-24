import { formatCurrency } from '@/lib/shared/formatting';

/**
 * Build an accessible label for a profit-and-loss cell.
 *
 * Composes a single sentence so screen readers don't announce currency and
 * percentage as two disconnected fragments. Sign is stripped from both the
 * currency and the percentage — the directional word ("up"/"down"/
 * "unchanged") already conveys polarity, so leaving signs in would make the
 * announcement read inconsistently (e.g. "down $123.45 (-4.20%)").
 *
 * Returns a graceful "unavailable" sentence when `pnl` is missing or not
 * finite. The `pnlPercent` arm is optional and is dropped when the value is
 * missing or non-finite (e.g. division-by-zero upstream produced Infinity).
 */
export function buildPnlAriaLabel(
  pnl: number | null | undefined,
  pnlPercent: number | null | undefined
): string {
  if (pnl == null || !Number.isFinite(pnl)) {
    return 'Profit and loss unavailable';
  }

  const direction = pnl > 0 ? 'up' : pnl < 0 ? 'down' : 'unchanged';
  const magnitude = formatCurrency(Math.abs(pnl));

  if (pnlPercent != null && Number.isFinite(pnlPercent)) {
    const percentMagnitude = Math.abs(pnlPercent).toFixed(2);
    return `Profit and loss ${direction} ${magnitude} (${percentMagnitude}%)`;
  }

  return `Profit and loss ${direction} ${magnitude}`;
}
