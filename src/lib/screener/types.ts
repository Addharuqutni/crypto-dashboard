import type {
  FuturesDataHealth,
  FuturesGrade,
  FuturesMarketRegimeId,
  FuturesSignalAction,
  FuturesTradePermission,
} from '@/types/futures-signal';
import type { WorkerInterval } from '@/lib/worker/types';

export type ScreenerRunStatus = 'idle' | 'running' | 'completed' | 'completed_with_errors' | 'failed';

export interface ScreenerAlertSettings {
  enabled: boolean;
  minConfidence: number;
  minGrade: FuturesGrade;
  minRiskReward: number;
  maxAlertsPerHour: number;
  cooldownMinutes: number;
  sendWaitAlerts: boolean;
  topNOnly: number;
}

export interface ScreenerConfig {
  symbols: ScreenerUniverseCoin[];
  setupTimeframe: WorkerInterval;
  triggerTimeframe: WorkerInterval;
  macroTimeframe: WorkerInterval;
  intervalMinutes: number;
  maxConcurrentSymbols: number;
  candleLimit: number;
  alertSettings: ScreenerAlertSettings;
}

export interface ScreenerUniverseCoin {
  symbol: string;
  baseAsset: string;
  quoteAsset: string;
  marketCapRank?: number;
}

export interface ScreenerHealth {
  status: ScreenerRunStatus;
  startedAt: number | null;
  completedAt: number | null;
  evaluatedSymbols: number;
  failedSymbols: number;
  errors: Array<{ symbol: string; message: string }>;
}

export interface ScreenerResult {
  symbol: string;
  baseAsset: string;
  quoteAsset: string;
  marketCapRank?: number;
  setupTimeframe: WorkerInterval;
  triggerTimeframe: WorkerInterval;
  macroTimeframe: WorkerInterval;
  evaluatedAt: number;
  candleCloseTime: number | null;
  dataHealth: FuturesDataHealth;
  action: FuturesSignalAction;
  confidence: number;
  grade: FuturesGrade;
  entry: number | null;
  stopLoss: number | null;
  takeProfits: Array<number | null>;
  riskReward: number | null;
  marketRegime: FuturesMarketRegimeId;
  tradePermission: FuturesTradePermission;
  reasons: string[];
  noTradeReasons: string[];
  fundingRate: number | null;
  openInterestChangePercent: number | null;
  mtfAlignmentScore: number | null;
  warnings: string[];
}

export interface RankedScreenerResult extends ScreenerResult {
  rank: number;
  rankingScore: number;
  rankReason: string[];
  alertEligible: boolean;
  alertBlockReasons: string[];
}

export interface ScreenerAlertRecord {
  symbol: string;
  action: FuturesSignalAction;
  rankingScore: number;
  confidence: number;
  grade: FuturesGrade;
  entry: number | null;
  stopLoss: number | null;
  status: 'sent' | 'skipped' | 'disabled' | 'failed';
  reason: string;
  createdAt: number;
}

export interface ScreenerAiAuditSummary {
  symbol: string;
  verdict: 'VALID' | 'WEAK' | 'WAIT_PREFERRED';
  summary: string;
  mainRisk: string;
  nextStep: string;
  caveats: string[];
  generatedAt: number;
}
