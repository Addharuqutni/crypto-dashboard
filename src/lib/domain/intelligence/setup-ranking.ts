import type {
  MarketContext,
  SetupGrade,
  SetupRanking,
} from '@/types/intelligence';
import type { FuturesSignal } from '@/types/futures-signal';

/**
 * Phase 4 — setup ranking.
 *
 * Pure scoring function over (signal, market context, journal stats).
 * Returns a 0-100 composite plus the per-dimension breakdown so the UI can
 * explain *why* a setup ranked the way it did.
 *
 * Weights were chosen so that:
 *   - regime alignment + data health together can suppress an otherwise
 *     pretty setup (capital preservation > excitement)
 *   - journal history can lift a B-grade setup if it has historical edge
 *   - volatility is a damper, not a primary scorer
 */

export interface SetupRankingInput {
  signal: FuturesSignal;
  marketContext: MarketContext;
  journalStats?: {
    sampleSize: number;
    winRate: number;
    averageR: number;
  };
}

const WEIGHTS = {
  regimeAlignment: 0.25,
  triggerQuality: 0.2,
  riskReward: 0.2,
  dataHealth: 0.15,
  volatility: 0.1,
  journalHistory: 0.1,
};

export function rankSetup(input: SetupRankingInput): SetupRanking {
  const regimeAlignment = scoreRegimeAlignment(input.signal, input.marketContext);
  const triggerQuality = scoreTriggerQuality(input.signal);
  const riskReward = scoreRiskReward(input.signal);
  const dataHealth = scoreDataHealth(input.signal);
  const volatility = scoreVolatility(input.marketContext);
  const journalHistory = scoreJournalHistory(input.journalStats);

  const composite =
    regimeAlignment * WEIGHTS.regimeAlignment +
    triggerQuality * WEIGHTS.triggerQuality +
    riskReward * WEIGHTS.riskReward +
    dataHealth * WEIGHTS.dataHealth +
    volatility * WEIGHTS.volatility +
    journalHistory * WEIGHTS.journalHistory;

  const score = Math.round(composite);
  const grade = scoreToGrade(score);
  const reasons = buildReasons({
    score,
    regimeAlignment,
    triggerQuality,
    riskReward,
    dataHealth,
    volatility,
    journalHistory,
  });

  return {
    score,
    grade,
    breakdown: {
      regimeAlignment: Math.round(regimeAlignment),
      triggerQuality: Math.round(triggerQuality),
      riskReward: Math.round(riskReward),
      dataHealth: Math.round(dataHealth),
      volatility: Math.round(volatility),
      journalHistory: Math.round(journalHistory),
    },
    reasons,
  };
}

function scoreRegimeAlignment(signal: FuturesSignal, ctx: MarketContext): number {
  // Hard zero when permission denies the action — capital preservation rule.
  if (signal.action === 'WAIT') return 0;
  if (ctx.tradePermission === 'no_trade') return 0;
  if (signal.action === 'LONG' && ctx.tradePermission === 'short_only') return 0;
  if (signal.action === 'SHORT' && ctx.tradePermission === 'long_only') return 0;

  // Regime label match — bullish_trend + LONG and bearish_trend + SHORT score
  // highest. Range trades get a mid score because mean-reversion in a range
  // is acceptable but not as strong a tailwind as a trend.
  if (signal.action === 'LONG' && ctx.btc4hRegime === 'bullish_trend') return 95;
  if (signal.action === 'SHORT' && ctx.btc4hRegime === 'bearish_trend') return 95;
  if (ctx.btc4hRegime === 'range') return 60;
  return 50;
}

function scoreTriggerQuality(signal: FuturesSignal): number {
  // Use the engine's own confidence as the strongest single signal of trigger
  // quality — it's the thing that already encodes EMA stack, ADX, MACD, and
  // pattern confirmation.
  if (signal.action === 'WAIT') return 0;
  return clamp(signal.confidence ?? signal.confidenceScore ?? 0);
}

function scoreRiskReward(signal: FuturesSignal): number {
  if (signal.action === 'WAIT') return 0;
  const rr = signal.riskRewardRatio ?? null;
  if (rr == null || rr <= 0) return 0;
  // 1R = 30, 2R = 65, 3R = 90, 4R+ = 100. Linear-ish, capped.
  if (rr >= 4) return 100;
  if (rr >= 3) return 90;
  if (rr >= 2) return 65;
  if (rr >= 1.5) return 45;
  return 25;
}

function scoreDataHealth(signal: FuturesSignal): number {
  const dh = signal.dataHealth;
  if (!dh) return 50;
  if (!dh.ok) return 25;
  // Confidence cap reflects how much trust the engine placed in the data;
  // map the cap directly into a score so a 70-cap setup ranks below a
  // 100-cap setup even if everything else is identical.
  return clamp(dh.confidenceCap ?? 70);
}

function scoreVolatility(ctx: MarketContext): number {
  switch (ctx.volatility.regime) {
    case 'low':
      return 80;
    case 'normal':
      return 100;
    case 'high':
      return 50;
    case 'extreme':
      return 0;
  }
}

function scoreJournalHistory(stats?: SetupRankingInput['journalStats']): number {
  if (!stats || stats.sampleSize < 10) return 50; // unknown → neutral
  // Map win rate + avg R into a single 0-100. Win rate dominates below 50%,
  // average R dominates above. Composite is intentionally simple because
  // small samples are noisy and we don't want to encourage over-weighting.
  const winScore = clamp(stats.winRate);
  const rScore = clamp(50 + stats.averageR * 30); // 0R → 50, +1R → 80, -1R → 20
  return clamp((winScore + rScore) / 2);
}

function scoreToGrade(score: number): SetupGrade {
  if (score >= 90) return 'A+';
  if (score >= 80) return 'A';
  if (score >= 70) return 'B';
  if (score >= 60) return 'C';
  if (score >= 50) return 'D';
  return 'F';
}

function clamp(v: number, min = 0, max = 100): number {
  if (!Number.isFinite(v)) return min;
  if (v < min) return min;
  if (v > max) return max;
  return v;
}

function buildReasons(parts: {
  score: number;
  regimeAlignment: number;
  triggerQuality: number;
  riskReward: number;
  dataHealth: number;
  volatility: number;
  journalHistory: number;
}): string[] {
  const reasons: string[] = [];
  if (parts.regimeAlignment >= 80) reasons.push('Aligned with the dominant 4H regime.');
  else if (parts.regimeAlignment <= 30) reasons.push('Trade direction conflicts with regime permission.');
  if (parts.triggerQuality >= 75) reasons.push('Strong engine confidence on the trigger.');
  if (parts.riskReward >= 80) reasons.push('Risk:reward is in the disciplined band.');
  else if (parts.riskReward <= 40) reasons.push('Risk:reward is below the standard threshold.');
  if (parts.dataHealth <= 50) reasons.push('Data health caps confidence — context is incomplete.');
  if (parts.volatility <= 40) reasons.push('Volatility is unfavourable — slippage and stop-runs likely.');
  if (parts.journalHistory >= 75) reasons.push('Historical journal performance favours this setup.');
  if (parts.journalHistory <= 30) reasons.push('Historical journal performance is poor for this setup.');
  if (reasons.length === 0) reasons.push('All ranking dimensions are within standard bands.');
  return reasons;
}
