/**
 * No-Trade Reason Ranking.
 *
 * Collects all reasons a signal might WAIT and returns them ordered by
 * severity. The first item is the highest-severity reason and surfaces in
 * the UI as the primary explanation.
 *
 * Severity order (highest → lowest):
 *   1. insufficient data
 *   2. risk override / no trade
 *   3. RR below minimum
 *   4. extreme volatility
 *   5. MTF conflict
 *   6. chop/range regime
 *   7. overextended price
 *   8. funding/OI warning
 *   9. weak score
 *  10. no entry trigger
 */

export type NoTradeSeverity =
  | 'INSUFFICIENT_DATA'
  | 'RISK_NO_TRADE'
  | 'RR_BELOW_MIN'
  | 'EXTREME_VOLATILITY'
  | 'MTF_CONFLICT'
  | 'CHOP_RANGE'
  | 'OVEREXTENDED'
  | 'POSITIONING_WARNING'
  | 'WEAK_SCORE'
  | 'NO_TRIGGER';

const SEVERITY_ORDER: NoTradeSeverity[] = [
  'INSUFFICIENT_DATA',
  'RISK_NO_TRADE',
  'RR_BELOW_MIN',
  'EXTREME_VOLATILITY',
  'MTF_CONFLICT',
  'CHOP_RANGE',
  'OVEREXTENDED',
  'POSITIONING_WARNING',
  'WEAK_SCORE',
  'NO_TRIGGER',
];

export interface NoTradeReason {
  severity: NoTradeSeverity;
  message: string;
}

export interface RankedNoTradeReasons {
  reasons: string[];
  primary: string | null;
}

/**
 * Stable-sort reasons by severity rank then return both the ranked list and
 * the primary reason.
 */
export function rankNoTradeReasons(reasons: NoTradeReason[]): RankedNoTradeReasons {
  if (reasons.length === 0) return { reasons: [], primary: null };

  const ranked = [...reasons].sort((a, b) => severityIndex(a.severity) - severityIndex(b.severity));
  const messages = ranked.map((r) => r.message);
  return {
    reasons: messages,
    primary: messages[0] ?? null,
  };
}

/**

 * Menjalankan logic severity index.

 * Dipakai untuk memisahkan tanggung jawab fungsi ini dari bagian aplikasi lain.

 */

function severityIndex(s: NoTradeSeverity): number {
  const idx = SEVERITY_ORDER.indexOf(s);
  return idx === -1 ? Number.MAX_SAFE_INTEGER : idx;
}
