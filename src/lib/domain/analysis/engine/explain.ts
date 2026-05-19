import type { Candle } from '@/types/chart';
import type {
  FuturesEntryTrigger,
  FuturesMtfConfirmation,
  FuturesSignalAction,
  FuturesSignalInput,
} from '@/types/futures-signal';
import { getRsiStatus } from '@/lib/domain/indicators/rsi';
import type { RegimeContext } from '../regime-detector';
import type { NoTradeReason } from '../no-trade-rank';

/**
 * Build the human-readable reason list shown alongside a signal.
 *
 * Reads (does not compute) the regime/RSI/EMA/ADX/ATR/MTF context produced
 * upstream so the same numbers shown in the UI match what the engine used.
 */
export function collectReasons(
  side: 'LONG' | 'SHORT',
  regime: RegimeContext,
  input: FuturesSignalInput,
  candles: Candle[],
  mtf: FuturesMtfConfirmation
): string[] {
  const reasons: string[] = [];
  reasons.push(`Regime: ${regime.regime} — ${regime.reason}`);

  const rsi = input.rsi ?? getRsiStatus(candles);
  if (rsi.value != null) {
    reasons.push(`RSI ${rsi.value.toFixed(0)} (${rsi.status.replace('_', ' ')}).`);
  }

  if (regime.ema20 != null && regime.ema50 != null) {
    reasons.push(regime.ema20 > regime.ema50 ? 'EMA20 > EMA50' : 'EMA20 < EMA50');
  }

  if (regime.adx != null) {
    reasons.push(
      `ADX ${regime.adx.toFixed(1)} (+DI ${regime.plusDi?.toFixed(1) ?? '—'} / -DI ${regime.minusDi?.toFixed(1) ?? '—'}).`
    );
  }

  if (regime.atrPctOfPrice != null) {
    reasons.push(`ATR ${(regime.atrPctOfPrice * 100).toFixed(2)}% of price.`);
  }

  if (mtf.macroBias !== 'INSUFFICIENT_DATA' || mtf.triggerBias !== 'INSUFFICIENT_DATA') {
    reasons.push(
      `MTF: macro ${mtf.macroBias.toLowerCase()} · setup ${mtf.setupBias.toLowerCase()} · trigger ${mtf.triggerBias.toLowerCase()} (alignment ${mtf.alignmentScore.toFixed(0)}).`
    );
  }

  reasons.push(`Bias: ${side}.`);
  return reasons;
}

/**
 * Build the one-line summary that fronts the signal in UI/journal/Telegram.
 *
 * Discipline-first language: never imply guaranteed profit, never instruct an
 * action without invalidation/RR context.
 */
export function buildSummary(
  action: FuturesSignalAction,
  regime: RegimeContext,
  rr: number | null,
  trigger: FuturesEntryTrigger
): string {
  const triggerLabel = trigger.toLowerCase().replace(/_/g, ' ');
  const regimeLabel = regime.regime.toLowerCase().replace('_', ' ');
  if (action === 'LONG') {
    return `Long bias supported by ${regimeLabel}. Trigger: ${triggerLabel}. Plan risk first; RR≈${rr?.toFixed(2) ?? '—'} to TP2.`;
  }
  if (action === 'SHORT') {
    return `Short bias supported by ${regimeLabel}. Trigger: ${triggerLabel}. Plan risk first; RR≈${rr?.toFixed(2) ?? '—'} to TP2.`;
  }
  return 'No actionable setup. Stand aside.';
}

/**
 * Map a risk-engine WAIT message to the matching `NoTradeReason` severity.
 *
 * Keeps WAIT-explanation severities consistent with the pipeline's ranking
 * logic without leaking risk-engine implementation details into the engine.
 */
export function inferRiskWaitSeverity(reason: string): NoTradeReason['severity'] {
  const r = reason.toLowerCase();
  if (r.includes('extreme')) return 'EXTREME_VOLATILITY';
  if (r.includes('risk:reward') || r.includes('rr')) return 'RR_BELOW_MIN';
  if (r.includes('overextended')) return 'OVEREXTENDED';
  return 'RISK_NO_TRADE';
}
