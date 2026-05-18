import type { FuturesSignal } from '@/types/futures-signal';

/**
 * Telegram alert formatter.
 *
 * The format follows the Phase 3 spec exactly. Markdown is used because
 * Telegram's Markdown parser is unobtrusive and renders cleanly across
 * mobile clients. Symbols/numbers are escaped/safed where appropriate.
 *
 * Every formatter is pure: same input → same output. Easy to test and
 * easy to diff in code review.
 */

export interface FormatTradeAlertArgs {
  symbol: string;
  setupTimeframe: string;
  macroTimeframe: string;
  signal: FuturesSignal;
}

export function formatTradeAlert(args: FormatTradeAlertArgs): string {
  const s = args.signal;
  const action = s.action;
  const grade = s.grade ?? 'D';
  const conf = Math.round(s.confidence ?? s.confidenceScore ?? 0);

  const setupLines: string[] = [];
  setupLines.push(`- Regime ${labelRegime(s.marketRegime)}`);
  setupLines.push(`- Permission: ${labelPermission(s.tradePermission)}`);
  setupLines.push(`- Trigger: ${labelTrigger(s.entryTrigger)}`);
  if (s.mtfConfirmation) {
    setupLines.push(
      `- MTF alignment: ${s.mtfConfirmation.alignmentScore.toFixed(0)}/100`
    );
  }

  // Forecast/Kronos lines — surfaced only when forecast metadata is present.
  // Forecast remains supporting evidence; the footer reaffirms risk-engine
  // authority on every alert.
  const forecastLines: string[] = [];
  if (s.forecastAlignment) {
    forecastLines.push(`- Kronos: ${s.forecastAlignment}`);
    if (s.forecastDirection) {
      forecastLines.push(`- Forecast: ${s.forecastDirection}`);
    }
    if (s.forecastWarnings && s.forecastWarnings.length > 0) {
      for (const w of s.forecastWarnings) {
        forecastLines.push(`- Forecast note: ${escapeMd(w)}`);
      }
    }
  }

  const riskLines: string[] = [];
  if (s.entryZone?.min != null) {
    riskLines.push(`- Entry: ${formatPrice(s.entryZone.min)}`);
  }
  if (s.stopLoss != null) riskLines.push(`- SL: ${formatPrice(s.stopLoss)}`);
  if (s.takeProfits?.tp1 != null) {
    const tps = [s.takeProfits.tp1, s.takeProfits.tp2, s.takeProfits.tp3]
      .filter((p): p is number => p != null)
      .map(formatPrice)
      .join(' / ');
    riskLines.push(`- TP: ${tps}`);
  }
  if (s.invalidation) riskLines.push(`- Invalidation: ${escapeMd(s.invalidation)}`);
  if (s.riskLevel) riskLines.push(`- Risk level: ${s.riskLevel}`);

  const reasonLines = (s.reasons ?? []).slice(0, 6).map((r) => `- ${escapeMd(r)}`);
  if (reasonLines.length === 0) reasonLines.push('- (no extra reasons)');

  const nextStep = nextStepLine(action, s);

  const heading = `*Action:* ${action}  |  *Confidence:* ${conf}  |  *Grade:* ${grade}`;
  const tfLine = `*Timeframe:* ${escapeMd(args.symbol)} Futures — ${args.setupTimeframe}, arah ${args.macroTimeframe}`;

  const sections: string[] = [
    heading,
    tfLine,
    '',
    '*Setup:*',
    ...setupLines,
  ];

  if (forecastLines.length > 0) {
    sections.push('', '*Forecast:*', ...forecastLines);
  }

  sections.push(
    '',
    '*Risk:*',
    ...riskLines,
    '',
    '*Reason:*',
    ...reasonLines,
    '',
    '*Next step:*',
    `- ${nextStep}`,
    '',
    '_Risk engine remains final authority._'
  );

  return sections.join('\n');
}

/**
 * Brief health-warning message. Sent when the worker repeatedly fails
 * data-health checks; rate-limited by the dedupe layer.
 */
export interface FormatHealthAlertArgs {
  symbol: string;
  reason: string;
  consecutiveErrors: number;
  lastSuccessAt: number | null;
}

export function formatHealthAlert(args: FormatHealthAlertArgs): string {
  const lines = [
    '*⚠ Worker health warning*',
    `*Symbol:* ${escapeMd(args.symbol)}`,
    `*Reason:* ${escapeMd(args.reason)}`,
    `*Consecutive errors:* ${args.consecutiveErrors}`,
  ];
  if (args.lastSuccessAt) {
    const ageMin = Math.round((Date.now() - args.lastSuccessAt) / 60000);
    lines.push(`*Last success:* ${ageMin}m ago`);
  } else {
    lines.push(`*Last success:* never`);
  }
  lines.push('');
  lines.push(
    '_No trade signal will be issued while data is degraded. Capital preservation first._'
  );
  return lines.join('\n');
}

function labelRegime(id: FuturesSignal['marketRegime'] | undefined): string {
  if (!id) return 'unknown';
  return id.replace(/_/g, ' ');
}

function labelPermission(p: FuturesSignal['tradePermission'] | undefined): string {
  if (!p) return 'unknown';
  return p.replace(/_/g, ' ');
}

function labelTrigger(t: FuturesSignal['entryTrigger'] | undefined): string {
  if (!t) return 'no trigger';
  return t.toLowerCase().replace(/_/g, ' ');
}

function formatPrice(n: number): string {
  if (!Number.isFinite(n)) return '—';
  if (Math.abs(n) >= 1) return n.toFixed(2);
  if (Math.abs(n) >= 0.01) return n.toFixed(4);
  return n.toFixed(8);
}

function escapeMd(text: string): string {
  // Escape Telegram-Markdown specials so we don't accidentally break the
  // surrounding emphasis/anchor parsing.
  return text.replace(/([_*`\[\]()])/g, '\\$1');
}

function nextStepLine(action: FuturesSignal['action'], s: FuturesSignal): string {
  if (action === 'WAIT') {
    if (s.primaryNoTradeReason) {
      return `Stand aside: ${escapeMd(s.primaryNoTradeReason)}`;
    }
    return 'Stand aside until conditions improve.';
  }
  if (s.entryZone?.min != null && s.stopLoss != null) {
    return `${action === 'LONG' ? 'Long' : 'Short'} only on confirmation; place SL at ${formatPrice(s.stopLoss)}.`;
  }
  return 'Wait for confirmation before entering.';
}
