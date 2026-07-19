import type { ActionCallView } from '@/types/action-call';

export interface FormatTradeAlertArgs {
  symbol: string;
  setupTimeframe: string;
  macroTimeframe: string;
  signal: ActionCallView;
}

export function formatTradeAlert(args: FormatTradeAlertArgs): string {
  const s = args.signal;
  const action = s.action;
  const grade = s.signalGrade;
  const conf = Math.round(s.confidenceScore ?? 0);

  const setupLines: string[] = [
    `- Signal: ${escapeMd(s.signal)}`,
    `- Status: ${escapeMd(s.status)}`,
    `- Regime: ${escapeMd(s.regime)}`,
    `- Bias: ${escapeMd(s.bias)}`,
    `- Trend: ${escapeMd(s.trend)}`,
  ];

  const riskLines: string[] = [];
  if (s.entryZone?.min != null) {
    riskLines.push(`- Entry: ${formatPrice(s.entryZone.min)}`);
  }
  if (s.stopLoss != null) riskLines.push(`- SL: ${formatPrice(s.stopLoss)}`);
  if (s.takeProfits?.tp1 != null) {
    riskLines.push(`- TP: ${formatPrice(s.takeProfits.tp1)}`);
  }
  if (s.riskRewardRatio != null) {
    riskLines.push(`- RR: ${s.riskRewardRatio.toFixed(2)}`);
  }
  if (s.invalidationReason) {
    riskLines.push(`- Invalidation: ${escapeMd(s.invalidationReason)}`);
  }

  const reasonLines = (s.reasons ?? []).slice(0, 6).map((r) => `- ${escapeMd(r)}`);
  if (reasonLines.length === 0) reasonLines.push('- (no extra reasons)');

  const heading = `*Action:* ${action}  |  *Confidence:* ${conf}  |  *Grade:* ${grade}`;
  const tfLine = `*Symbol:* ${escapeMd(args.symbol)} — Python Action Call MTF`;

  return [
    heading,
    tfLine,
    '',
    '*Setup:*',
    ...setupLines,
    '',
    '*Risk:*',
    ...(riskLines.length > 0 ? riskLines : ['- (no levels)']),
    '',
    '*Reason:*',
    ...reasonLines,
    '',
    '*Next step:*',
    `- ${nextStepLine(action, s)}`,
    '',
    '_Python Action Call is the sole signal source. Educational only._',
  ].join('\n');
}

export interface FormatHealthAlertArgs {
  symbol: string;
  reason: string;
  consecutiveErrors: number;
  lastSuccessAt: number | null;
}

export function formatHealthAlert(args: FormatHealthAlertArgs): string {
  const lines = [
    '*Worker health warning*',
    `*Symbol:* ${escapeMd(args.symbol)}`,
    `*Reason:* ${escapeMd(args.reason)}`,
    `*Consecutive errors:* ${args.consecutiveErrors}`,
  ];
  if (args.lastSuccessAt != null) {
    lines.push(`*Last success:* ${new Date(args.lastSuccessAt).toISOString()}`);
  }
  lines.push('_Python agent unreachable or errored._');
  return lines.join('\n');
}

function nextStepLine(action: ActionCallView['action'], s: ActionCallView): string {
  if (action === 'WAIT') {
    return s.noTradeReasons[0] ?? 'Stand aside until MTF alignment returns.';
  }
  if (s.status === 'WAIT_CONFIRMATION') {
    return 'Watch only — wait for confirmation before entry.';
  }
  return action === 'LONG'
    ? 'Consider long only after own risk check.'
    : 'Consider short only after own risk check.';
}

function formatPrice(n: number): string {
  if (!Number.isFinite(n)) return '-';
  if (n >= 1000) return n.toFixed(2);
  if (n >= 1) return n.toFixed(4);
  return n.toPrecision(4);
}

function escapeMd(value: string): string {
  return String(value ?? '').replace(/([_*`[\]])/g, '\\$1');
}
