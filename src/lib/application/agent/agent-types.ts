import type { FuturesSignalAction } from '@/types/futures-signal';
import type { RankedScreenerResult, ScreenerAiAuditSummary } from '@/lib/application/screener/types';

export type AgentDecision = 'WATCH' | 'AVOID' | 'WAIT_CONFIRMATION' | 'HIGH_RISK';
export type AgentRiskLevel = 'LOW' | 'MEDIUM' | 'HIGH';

export interface AgentSignalContext {
  symbol: string;
  action: FuturesSignalAction;
  timeframe: string;
  price: number | null;
  confidence: number;
  grade: string;
  rankingScore: number;
  riskReward: number | null;
  marketRegime: string;
  tradePermission: string;
  mtfAlignmentScore: number | null;
  dataHealthOk: boolean;
  reasons: string[];
  warnings: string[];
  noTradeReasons: string[];
  entry: number | null;
  stopLoss: number | null;
  takeProfits: Array<number | null>;
  audit?: ScreenerAiAuditSummary;
}

export interface AgentSignalDecision {
  symbol: string;
  timeframe: string;
  engineAction: FuturesSignalAction;
  decision: AgentDecision;
  confidence: number;
  riskLevel: AgentRiskLevel;
  summary: string;
  reasons: string[];
  invalidations: string[];
  plan: {
    entryTrigger: string;
    stopLoss: string;
    takeProfit: string;
  };
  generatedAt: number;
}

export interface AgentRunResult {
  generatedAt: number;
  decisions: AgentSignalDecision[];
}

export type AgentInput = RankedScreenerResult;
