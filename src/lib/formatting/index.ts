/**
 * Currency formatter — formats number as USD currency.
 * Examples: $67,245.20, $0.00, $1,234.56
 */
export function formatCurrency(value: number | undefined | null, decimals = 2): string {
  if (value == null || isNaN(value)) return '—';

  // For very small values (< $1), show more decimals
  const effectiveDecimals = Math.abs(value) < 1 && Math.abs(value) > 0 ? 4 : decimals;

  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: effectiveDecimals,
    maximumFractionDigits: effectiveDecimals,
  }).format(value);
}

/**
 * Percentage formatter — formats number as percentage with sign.
 * Examples: +2.45%, -1.12%, 0.00%
 */
export function formatPercentage(value: number | undefined | null, decimals = 2): string {
  if (value == null || isNaN(value)) return '—';

  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(decimals)}%`;
}

/**
 * Compact number formatter — formats large numbers with suffix.
 * Examples: $1.2B, $456.7M, $12.3K
 */
export function formatCompactNumber(value: number | undefined | null): string {
  if (value == null || isNaN(value)) return '—';

  if (Math.abs(value) >= 1_000_000_000) {
    return `$${(value / 1_000_000_000).toFixed(1)}B`;
  }
  if (Math.abs(value) >= 1_000_000) {
    return `$${(value / 1_000_000).toFixed(1)}M`;
  }
  if (Math.abs(value) >= 1_000) {
    return `$${(value / 1_000).toFixed(1)}K`;
  }
  return formatCurrency(value);
}

/**
 * Date/time formatter — formats timestamp to readable string.
 */
export function formatDateTime(timestamp: number | undefined | null): string {
  if (timestamp == null || isNaN(timestamp)) return '—';

  return new Intl.DateTimeFormat('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(new Date(timestamp));
}

/**
 * Relative time formatter — shows how long ago something happened.
 * Examples: "12s ago", "3m ago", "1h ago"
 */
export function formatRelativeTime(timestamp: number | undefined | null): string {
  if (timestamp == null || isNaN(timestamp)) return '—';

  const diff = Date.now() - timestamp;
  const seconds = Math.floor(diff / 1000);

  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}
