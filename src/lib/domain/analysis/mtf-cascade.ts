import type { ChartTimeframe } from '@/types/chart';

/**
 * Multi-timeframe cascade map.
 *
 * - **Setup TF** = the user's chart selection.
 * - **Macro** = directional context (higher TF). Used to confirm or veto bias.
 * - **Trigger** = last-mile confirmation (lower TF). Used to time entries.
 *
 * Falls back gracefully when the cascade hits the edges (e.g. 5m has no
 * sensible trigger lower, 30D has no sensible macro higher).
 *
 * Lifted out of the coin detail page so the same mapping can be unit-tested
 * in isolation and reused by alerts / dashboard surfaces when MTF context
 * spreads beyond the detail page.
 */
export const MTF_CASCADE: Record<
  ChartTimeframe,
  { macro?: ChartTimeframe; trigger?: ChartTimeframe }
> = {
  '5m': { macro: '15m' },
  '15m': { macro: '1H', trigger: '5m' },
  '30m': { macro: '4H', trigger: '15m' },
  '1H': { macro: '4H', trigger: '15m' },
  '4H': { macro: '24H', trigger: '1H' },
  '24H': { macro: '7D', trigger: '4H' },
  '7D': { macro: '30D', trigger: '24H' },
  '30D': { trigger: '7D' },
};
