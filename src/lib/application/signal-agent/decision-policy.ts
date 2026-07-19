import type { AgentDecision, AgentRiskLevel, AgentSignalContext, AgentSignalDecision } from './agent-types';

const HIGH_GRADES = new Set(['A', 'A+', 'S']);

export function decideSignal(context: AgentSignalContext): AgentSignalDecision {
  const riskLevel = classifyRisk(context);
  const decision = chooseDecision(context, riskLevel);

  return {
    symbol: context.symbol,
    timeframe: context.timeframe,
    engineAction: context.action,
    decision,
    confidence: cappedConfidence(context, riskLevel),
    riskLevel,
    summary: buildSummary(context, decision, riskLevel),
    reasons: buildReasons(context),
    invalidations: buildInvalidations(context),
    plan: buildPlan(context, decision),
    generatedAt: Date.now(),
  };
}

export function classifyRisk(context: AgentSignalContext): AgentRiskLevel {
  if (!context.dataHealthOk || context.noTradeReasons.length > 0) return 'HIGH';
  if (context.action === 'WAIT') return 'HIGH';
  if (context.warnings.length >= 2) return 'HIGH';
  if ((context.riskReward ?? 0) < 1.2) return 'HIGH';
  if ((context.mtfAlignmentScore ?? 0) < 55) return 'HIGH';
  if (context.audit?.verdict === 'WAIT_PREFERRED') return 'HIGH';

  if (context.warnings.length > 0) return 'MEDIUM';
  if ((context.riskReward ?? 0) < 1.8) return 'MEDIUM';
  if ((context.mtfAlignmentScore ?? 100) < 70) return 'MEDIUM';
  if (context.audit?.verdict === 'WEAK') return 'MEDIUM';

  return 'LOW';
}

function chooseDecision(context: AgentSignalContext, riskLevel: AgentRiskLevel): AgentDecision {
  if (context.action === 'WAIT') return 'WAIT_CONFIRMATION';
  if (riskLevel === 'HIGH') return context.dataHealthOk ? 'HIGH_RISK' : 'AVOID';
  if (riskLevel === 'MEDIUM') return 'WAIT_CONFIRMATION';
  if (context.confidence >= 70 && HIGH_GRADES.has(context.grade)) return 'WATCH';
  return 'WAIT_CONFIRMATION';
}

function cappedConfidence(context: AgentSignalContext, riskLevel: AgentRiskLevel): number {
  const cap = riskLevel === 'HIGH' ? 65 : riskLevel === 'MEDIUM' ? 78 : 92;
  return Math.max(0, Math.min(cap, Math.round(context.confidence)));
}

function buildSummary(context: AgentSignalContext, decision: AgentDecision, riskLevel: AgentRiskLevel): string {
  const auditText = context.audit ? ` AI audit: ${context.audit.verdict}.` : '';
  return `${context.symbol} ${context.action} => ${decision}. Risk ${riskLevel}. Confidence ${context.confidence}. Regime ${context.marketRegime}.${auditText}`;
}

function buildReasons(context: AgentSignalContext): string[] {
  const auditReason = context.audit ? [`AI audit: ${context.audit.summary}`] : [];
  return [...context.reasons, ...auditReason, ...context.warnings.map((w) => `Warning: ${w}`)].slice(0, 8);
}

function buildInvalidations(context: AgentSignalContext): string[] {
  const invalidations = [...context.noTradeReasons, ...context.warnings];
  if (context.stopLoss != null) invalidations.unshift(`Price invalidates setup near stop loss ${context.stopLoss}`);
  if (!context.dataHealthOk) invalidations.unshift('Data health is not OK');
  return invalidations.length > 0 ? invalidations.slice(0, 6) : ['Wait for candle close confirmation before action.'];
}

function buildPlan(context: AgentSignalContext, decision: AgentDecision): AgentSignalDecision['plan'] {
  if (decision === 'AVOID') {
    return {
      entryTrigger: 'No entry. Refresh data and wait for a cleaner deterministic setup.',
      stopLoss: 'Not applicable.',
      takeProfit: 'Not applicable.',
    };
  }

  return {
    entryTrigger: context.entry != null ? `Wait for confirmed reaction around ${context.entry}.` : 'Wait for deterministic trigger confirmation.',
    stopLoss: context.stopLoss != null ? `Use deterministic stop area around ${context.stopLoss}.` : 'No validated stop level. Do not enter.',
    takeProfit: context.takeProfits.filter((v): v is number => typeof v === 'number').length > 0
      ? `Scale out near ${context.takeProfits.filter((v): v is number => typeof v === 'number').join(', ')}.`
      : 'No validated take-profit level. Wait.',
  };
}
