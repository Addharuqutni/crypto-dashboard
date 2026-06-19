import type { MarketContext, NoTradeExplanation } from '@/types/intelligence';
import type { FuturesSignal } from '@/types/futures-signal';
import { formatCurrency } from '@/lib/shared/formatting';

/**
 * Phase 4 — No-trade intelligence.
 *
 * When the engine emits `WAIT`, the user deserves more than "no setup".
 * This module classifies *why* the engine is sidelined and proposes the
 * specific condition / level / TF re-eval that would change the verdict.
 *
 * Pure: no fetches, no AI, deterministic outputs. The only state is the
 * signal itself plus the latest market context.
 */

const DEFAULT_REEVAL_MIN = 30;

export function explainNoTrade(
  signal: FuturesSignal,
  ctx: MarketContext
): NoTradeExplanation {
  // Priority order: data → permission → volatility → structure → R:R.
  // The first matching cause wins so the user always sees the most
  // important reason first.

  if (signal.dataHealth && !signal.dataHealth.ok) {
    return classifyDataHealth(signal);
  }

  if (
    signal.tradePermission === 'no_trade' ||
    ctx.tradePermission === 'no_trade'
  ) {
    return {
      category: 'permission',
      headline: 'Trade permission denied by the 4H regime gate.',
      detail:
        `The current 4H regime (${ctx.btc4hRegime.replace(/_/g, ' ')}) does not permit ` +
        'directional trading. Capital preservation rule.',
      conditionToChange:
        'Wait until the 4H regime resolves into bullish_trend, bearish_trend, or range.',
      levelToWatch: null,
      reevaluateInMinutes: 60,
    };
  }

  if (ctx.riskMode === 'no_trade') {
    return {
      category: 'volatility',
      headline: 'Aggregated risk mode is NO TRADE.',
      detail:
        `Volatility is ${ctx.volatility.regime} and the open-interest regime is ` +
        `${ctx.openInterest.regime}. Stops will not behave reliably.`,
      conditionToChange:
        'Wait for ATR/price to fall back below 1.8% and OI changes to normalise.',
      levelToWatch: null,
      reevaluateInMinutes: 60,
    };
  }

  if (ctx.volatility.regime === 'extreme' || ctx.volatility.regime === 'high') {
    return {
      category: 'volatility',
      headline: `Volatility is ${ctx.volatility.regime}.`,
      detail:
        ctx.volatility.atrToPrice != null
          ? `ATR/price is ${(ctx.volatility.atrToPrice * 100).toFixed(2)}%; stop runs are likely.`
          : 'ATR is elevated; stop runs are likely.',
      conditionToChange:
        'Wait for ATR/price to drop into the 0.5%–1.8% band before re-evaluating.',
      levelToWatch: null,
      reevaluateInMinutes: 30,
    };
  }

  // Structure: weak setup or trigger-side rejection.
  if (signal.entryStatus === 'not_triggered' || signal.entryStatus === 'invalid') {
    const noTradeReason =
      signal.primaryNoTradeReason ?? signal.noTradeReasons?.[0] ?? null;
    return {
      category: 'structure',
      headline: 'No qualified entry trigger yet.',
      detail:
        noTradeReason
          ? `Engine reason: ${noTradeReason}.`
          : 'Pattern, level, or volume confirmation is missing.',
      conditionToChange:
        'Wait for a fresh trigger that aligns with the 4H regime — breakout retest, range reversion, or pullback.',
      levelToWatch: extractLevelToWatch(signal),
      reevaluateInMinutes: DEFAULT_REEVAL_MIN,
    };
  }

  if (signal.riskApproval === 'fail') {
    return {
      category: 'risk_reward',
      headline: 'Risk engine rejected the setup.',
      detail:
        signal.invalidation
          ? `Risk engine: ${signal.invalidation}.`
          : 'Risk:reward, stop placement, or extension check failed.',
      conditionToChange:
        'Wait for an entry that allows ATR-distance stops with R:R ≥ 2 to TP2.',
      levelToWatch: extractLevelToWatch(signal),
      reevaluateInMinutes: DEFAULT_REEVAL_MIN,
    };
  }

  // Fallback — shouldn't normally hit this path, but the engine emits WAIT
  // for a long tail of edge cases (e.g. MTF conflict, low alignment).
  return {
    category: 'unknown',
    headline: 'Engine is on the sidelines.',
    detail:
      signal.primaryNoTradeReason ?? 'No single dominant reason was reported.',
    conditionToChange:
      'Wait for a higher-confidence setup that aligns with the 4H regime and passes the data-health gate.',
    levelToWatch: extractLevelToWatch(signal),
    reevaluateInMinutes: DEFAULT_REEVAL_MIN,
  };
}

function classifyDataHealth(signal: FuturesSignal): NoTradeExplanation {
  const dh = signal.dataHealth!;
  const issues: string[] = [];
  if (dh.setup && !dh.setup.ok && dh.setup.reason) issues.push(`setup: ${dh.setup.reason}`);
  if (dh.macro && !dh.macro.ok && dh.macro.reason) issues.push(`macro: ${dh.macro.reason}`);
  if (dh.trigger && !dh.trigger.ok && dh.trigger.reason) issues.push(`trigger: ${dh.trigger.reason}`);
  if (dh.symbol && !dh.symbol.valid && dh.symbol.reason) issues.push(`symbol: ${dh.symbol.reason}`);

  return {
    category: 'data',
    headline: 'Data health gate failed.',
    detail:
      issues.length > 0
        ? `Specific issues: ${issues.join('; ')}.`
        : 'One or more required data feeds are missing or stale.',
    conditionToChange:
      'Wait for fresh candles on every required timeframe and verify the symbol resolves on Binance Futures.',
    levelToWatch: null,
    reevaluateInMinutes: 5,
  };
}

/**
 * Extract a simple "level to watch" string from the signal. Prefers the
 * stop-loss when available because that's the level the engine itself uses
 * to invalidate the setup.
 */
function extractLevelToWatch(signal: FuturesSignal): string | null {
  if (signal.stopLoss != null) {
    return `Reclaim or rejection of ${formatCurrency(signal.stopLoss)} (engine SL anchor).`;
  }
  if (signal.entryZone?.min != null) {
    return `Reaction at ${formatCurrency(signal.entryZone.min)}.`;
  }
  return null;
}
