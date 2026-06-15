import { describe, expect, it } from 'vitest';
import { classifyRisk, decideSignal } from '../decision-policy';
import type { AgentSignalContext } from '../agent-types';

const baseContext: AgentSignalContext = {
  symbol: 'BTCUSDT',
  action: 'LONG',
  timeframe: '15m',
  price: 100,
  confidence: 82,
  grade: 'A',
  rankingScore: 90,
  riskReward: 2,
  marketRegime: 'BULLISH_TREND',
  tradePermission: 'ALLOWED',
  mtfAlignmentScore: 80,
  dataHealthOk: true,
  reasons: ['EMA trend aligned'],
  warnings: [],
  noTradeReasons: [],
  entry: 101,
  stopLoss: 98,
  takeProfits: [104, 108],
};

describe('decision-policy', () => {
  it('marks strong deterministic setup as WATCH', () => {
    expect(classifyRisk(baseContext)).toBe('LOW');
    expect(decideSignal(baseContext).decision).toBe('WATCH');
  });

  it('avoids unhealthy data', () => {
    const decision = decideSignal({ ...baseContext, dataHealthOk: false });
    expect(decision.decision).toBe('AVOID');
    expect(decision.riskLevel).toBe('HIGH');
  });

  it('waits when engine action is WAIT', () => {
    const decision = decideSignal({ ...baseContext, action: 'WAIT' });
    expect(decision.decision).toBe('WAIT_CONFIRMATION');
  });
});
