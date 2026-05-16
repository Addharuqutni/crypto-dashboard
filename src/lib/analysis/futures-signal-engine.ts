import type { Candle } from '@/types/chart';
import type {
  FuturesEntryTrigger,
  FuturesLiquiditySweep,
  FuturesMtfConfirmation,
  FuturesPositioning,
  FuturesSignal,
  FuturesSignalAction,
  FuturesSignalConfig,
  FuturesSignalGrade,
  FuturesSignalInput,
  FuturesSignalScoreBreakdown,
} from '@/types/futures-signal';
import { DEFAULT_FUTURES_SIGNAL_CONFIG } from '@/types/futures-signal';
import { detectRegime, type RegimeContext } from './regime-detector';
import { buildRiskPlan } from './risk-engine';
import { buildMtfConfirmation } from './multi-timeframe-engine';
import { applyFundingFilter } from './funding-rate-filter';
import { applyOpenInterestFilter } from './open-interest-filter';
import { detectLiquiditySweep } from './liquidity-sweep-detector';
import { classifyEntryTrigger } from './entry-trigger-classifier';
import { gradeSignal } from './signal-grade';
import {
  rankNoTradeReasons,
  type NoTradeReason,
} from './no-trade-rank';
import { getRsiStatus } from '@/lib/indicators/rsi';
import { calculateMACD } from '@/lib/indicators/macd';
import { calculateSupportResistance } from '@/lib/indicators/support-resistance';

/**
 * Futures Signal Engine V2.
 *
 * Pipeline:
 *   1. Regime detection (MTF setup TF).
 *   2. Multi-timeframe confirmation (macro + setup + trigger).
 *   3. Liquidity sweep detection (setup TF).
 *   4. Sub-score computation (trend/momentum/volume/structure/risk).
 *   5. Hard guards: overextension, MTF severe conflict, score floor.
 *   6. Regime gate: only trade in the direction the regime supports.
 *   7. Risk engine: stop, TPs, RR floor, leverage. Authoritative WAIT.
 *   8. Funding/OI filters: confidence adjustments + warnings.
 *   9. Entry trigger classification.
 *  10. Signal grade + ranked no-trade reasons (when WAIT).
 *
 * Risk override beats every other signal. Confirmation filters never CREATE
 * trades — only weaken or strengthen existing ones. WAIT is the safe default.
 */

const SCORE_WEIGHTS = {
  trend: 0.35,
  momentum: 0.25,
  volume: 0.15,
  structure: 0.15,
  risk: 0.1,
} as const;

interface SubScores {
  trendScore: number;
  momentumScore: number;
  volumeScore: number;
  structureScore: number;
  riskScore: number;
}

export function generateFuturesSignal(
  input: FuturesSignalInput,
  config: FuturesSignalConfig = DEFAULT_FUTURES_SIGNAL_CONFIG
): FuturesSignal {
  const { candles } = input;

  // --- 1. Regime detection. ---
  const regimeCtx = detectRegime(candles, config);

  // --- 2. MTF confirmation (cheap when extra TFs are missing). ---
  const mtf = buildMtfConfirmation(
    {
      setupCandles: candles,
      macroCandles: input.macroCandles,
      triggerCandles: input.triggerCandles,
    },
    config
  );

  // --- 3. Liquidity sweep on the setup TF. ---
  const liquiditySweep = detectLiquiditySweep(candles);

  // --- Pre-flight: insufficient data short-circuits everything. ---
  if (regimeCtx.regime === 'INSUFFICIENT_DATA') {
    return waitSignal({
      regime: 'INSUFFICIENT_DATA',
      reason: regimeCtx.reason,
      summary: 'Not enough data to derive a setup. Wait for more candles.',
      mtf,
      liquiditySweep,
      noTradeReasons: [{ severity: 'INSUFFICIENT_DATA', message: regimeCtx.reason }],
    });
  }

  const lastCandle = candles[candles.length - 1];
  if (!lastCandle) {
    return waitSignal({
      regime: 'INSUFFICIENT_DATA',
      reason: 'No candles available.',
      summary: 'Not enough data to derive a setup.',
      mtf,
      liquiditySweep,
      noTradeReasons: [{ severity: 'INSUFFICIENT_DATA', message: 'No candles available.' }],
    });
  }

  const price = input.livePrice && input.livePrice > 0 ? input.livePrice : lastCandle.close;

  // --- 4. Sub-scores per side. ---
  const longScores = computeSubScores('LONG', candles, price, regimeCtx, input);
  const shortScores = computeSubScores('SHORT', candles, price, regimeCtx, input);

  const longFinal = weightedScore(longScores);
  const shortFinal = weightedScore(shortScores);

  const candidateSide: 'LONG' | 'SHORT' = longFinal >= shortFinal ? 'LONG' : 'SHORT';
  const candidateScores = candidateSide === 'LONG' ? longScores : shortScores;
  let candidateFinal = candidateSide === 'LONG' ? longFinal : shortFinal;

  // --- 5. Funding + OI filters (confirmation only — adjust score, add warnings). ---
  const fundingFilter = applyFundingFilter(
    candidateSide,
    input.fundingRate ?? null,
    config
  );
  // Recent price-direction snapshot for OI filter:
  const recentBars = candles.slice(-Math.min(candles.length, 5));
  const priceChangePercent =
    recentBars.length >= 2 && recentBars[0]
      ? ((lastCandle.close - recentBars[0].close) / recentBars[0].close) * 100
      : null;
  const oiFilter = applyOpenInterestFilter(candidateSide, {
    priceChangePercent,
    oiChangePercent: input.openInterestChangePercent ?? null,
  });

  candidateFinal = clamp(candidateFinal + fundingFilter.scoreAdjustment + oiFilter.scoreAdjustment, 0, 100);

  const positioning: FuturesPositioning = {
    fundingRate: input.fundingRate ?? null,
    fundingBias: fundingFilter.bias,
    openInterestChangePercent: input.openInterestChangePercent ?? null,
    openInterestBias: oiFilter.bias,
  };

  const breakdown: FuturesSignalScoreBreakdown = {
    ...candidateScores,
    finalScore: candidateFinal,
  };

  const reasons = collectReasons(candidateSide, regimeCtx, input, candles, mtf);
  const warnings: string[] = [...fundingFilter.warnings, ...oiFilter.warnings];
  const noTradeReasons: NoTradeReason[] = [];

  // --- 6. Hard guard: overextension. ---
  if (regimeCtx.ema20 != null && regimeCtx.ema20 > 0) {
    const distancePct = Math.abs(price - regimeCtx.ema20) / regimeCtx.ema20;
    if (distancePct >= config.overextensionRatio) {
      warnings.push('Price is overextended from EMA20. Avoid chasing.');
      noTradeReasons.push({
        severity: 'OVEREXTENDED',
        message: `Entry is ${(distancePct * 100).toFixed(2)}% away from EMA20 — overextended.`,
      });
      return finalizeWait({
        regime: regimeCtx.regime,
        summary: 'Price is overextended. Wait for a pullback toward EMA20 before considering entry.',
        breakdown,
        reasons,
        warnings,
        confidence: candidateFinal,
        mtf,
        liquiditySweep,
        positioning,
        candidateSide,
        candles,
        regimeCtx,
        ranked: noTradeReasons,
      });
    }
  }

  // --- 7. Hard guard: severe MTF conflict. ---
  if (
    (mtf.macroBias === 'BULLISH' && mtf.setupBias === 'BEARISH') ||
    (mtf.macroBias === 'BEARISH' && mtf.setupBias === 'BULLISH')
  ) {
    noTradeReasons.push({
      severity: 'MTF_CONFLICT',
      message: `Macro bias is ${mtf.macroBias} but setup bias is ${mtf.setupBias}.`,
    });
    return finalizeWait({
      regime: regimeCtx.regime,
      summary: 'Higher and lower timeframes disagree. Wait for alignment.',
      breakdown,
      reasons,
      warnings,
      confidence: candidateFinal,
      mtf,
      liquiditySweep,
      positioning,
      candidateSide,
      candles,
      regimeCtx,
      ranked: noTradeReasons,
    });
  }

  // --- 8. MTF alignment floor. ---
  if (mtf.alignmentScore < config.mtfMinAlignmentScore && mtf.macroBias !== 'INSUFFICIENT_DATA') {
    noTradeReasons.push({
      severity: 'MTF_CONFLICT',
      message: `Multi-timeframe alignment ${mtf.alignmentScore.toFixed(0)} is below ${config.mtfMinAlignmentScore}.`,
    });
    return finalizeWait({
      regime: regimeCtx.regime,
      summary: 'Multi-timeframe alignment is too low. Wait for confirmation.',
      breakdown,
      reasons,
      warnings,
      confidence: candidateFinal,
      mtf,
      liquiditySweep,
      positioning,
      candidateSide,
      candles,
      regimeCtx,
      ranked: noTradeReasons,
    });
  }

  // --- 9. Score gates. ---
  if (candidateFinal < config.scoreNeutral) {
    noTradeReasons.push({
      severity: 'WEAK_SCORE',
      message: `Score ${candidateFinal.toFixed(0)} is below the no-trade threshold.`,
    });
    return finalizeWait({
      regime: regimeCtx.regime,
      summary: 'Signals are too weak. Wait for a clearer setup.',
      breakdown,
      reasons,
      warnings,
      confidence: candidateFinal,
      mtf,
      liquiditySweep,
      positioning,
      candidateSide,
      candles,
      regimeCtx,
      ranked: noTradeReasons,
    });
  }

  if (candidateFinal < config.scoreActionable) {
    warnings.push(
      `Score ${candidateFinal.toFixed(0)} is below the actionable threshold (${config.scoreActionable}). Wait for confirmation.`
    );
    noTradeReasons.push({
      severity: 'WEAK_SCORE',
      message:
        candidateFinal >= config.scoreValidWaitConfirm
          ? 'Setup forming but unconfirmed. Wait for a strong follow-through candle.'
          : 'Score is in the neutral zone. Hold off until conditions improve.',
    });
    return finalizeWait({
      regime: regimeCtx.regime,
      summary:
        candidateSide === 'LONG'
          ? 'Bullish bias forming. Wait for confirmation before entering.'
          : 'Bearish bias forming. Wait for confirmation before entering.',
      breakdown,
      reasons,
      warnings,
      confidence: candidateFinal,
      mtf,
      liquiditySweep,
      positioning,
      candidateSide,
      candles,
      regimeCtx,
      ranked: noTradeReasons,
    });
  }

  // --- 10. Regime gate. ---
  const regimeSupportsLong = regimeCtx.regime === 'BULLISH_TREND';
  const regimeSupportsShort = regimeCtx.regime === 'BEARISH_TREND';
  if (
    (candidateSide === 'LONG' && !regimeSupportsLong) ||
    (candidateSide === 'SHORT' && !regimeSupportsShort)
  ) {
    noTradeReasons.push({
      severity: 'CHOP_RANGE',
      message: `Regime ${regimeCtx.regime} does not support a ${candidateSide} setup.`,
    });
    return finalizeWait({
      regime: regimeCtx.regime,
      summary:
        regimeCtx.regime === 'CHOP_HIGH_RISK'
          ? 'Market is choppy. Avoid directional trades.'
          : 'Market is ranging. Wait for a clean trend before taking directional setups.',
      breakdown,
      reasons,
      warnings,
      confidence: candidateFinal,
      mtf,
      liquiditySweep,
      positioning,
      candidateSide,
      candles,
      regimeCtx,
      ranked: noTradeReasons,
    });
  }

  // --- 11. Risk engine. ---
  if (regimeCtx.atr == null) {
    noTradeReasons.push({
      severity: 'INSUFFICIENT_DATA',
      message: 'ATR is unavailable, cannot size risk.',
    });
    return finalizeWait({
      regime: regimeCtx.regime,
      summary: 'Risk cannot be quantified. Stand aside.',
      breakdown,
      reasons,
      warnings,
      confidence: candidateFinal,
      mtf,
      liquiditySweep,
      positioning,
      candidateSide,
      candles,
      regimeCtx,
      ranked: noTradeReasons,
    });
  }

  const plan = buildRiskPlan(
    {
      side: candidateSide,
      entry: price,
      candles,
      atr: regimeCtx.atr,
      ema20: regimeCtx.ema20,
      atrPctOfPrice: regimeCtx.atrPctOfPrice,
    },
    config
  );

  if (plan.action === 'WAIT') {
    const sev = inferRiskWaitSeverity(plan.invalidationReason);
    noTradeReasons.push({ severity: sev, message: plan.invalidationReason });
    return finalizeWait({
      regime: regimeCtx.regime,
      summary: 'Risk filter rejected the setup. Wait for better conditions.',
      breakdown,
      reasons,
      warnings: [...warnings, ...plan.warnings],
      confidence: candidateFinal,
      mtf,
      liquiditySweep,
      positioning,
      candidateSide,
      candles,
      regimeCtx,
      ranked: noTradeReasons,
    });
  }

  // --- 12. Entry trigger. ---
  const recentAvgVolume = computeAvgVolume(candles);
  const entryTrigger = classifyEntryTrigger({
    side: candidateSide,
    candles,
    regime: regimeCtx.regime,
    ema20: regimeCtx.ema20,
    ema50: regimeCtx.ema50,
    ema200: regimeCtx.ema200,
    supportResistance: input.supportResistance ?? calculateSupportResistance(candles),
    liquiditySweep,
    recentAvgVolume,
  });

  // No trigger means there's no clean reason to act right now.
  if (entryTrigger === 'NO_TRIGGER') {
    noTradeReasons.push({
      severity: 'NO_TRIGGER',
      message: 'No clean entry trigger detected. Wait for breakout, retest, or sweep reversal.',
    });
    return finalizeWait({
      regime: regimeCtx.regime,
      summary: 'Bias is fine but there is no clean entry trigger. Wait for confirmation.',
      breakdown,
      reasons,
      warnings: [...warnings, ...plan.warnings],
      confidence: candidateFinal,
      mtf,
      liquiditySweep,
      positioning,
      candidateSide,
      candles,
      regimeCtx,
      ranked: noTradeReasons,
    });
  }

  // --- 13. Final assembly. ---
  const action: FuturesSignalAction = candidateSide;
  const summary = buildSummary(action, regimeCtx, plan.riskRewardRatio, entryTrigger);
  const finalWarnings = [...warnings, ...plan.warnings];
  const grade = gradeSignal({
    action,
    finalScore: candidateFinal,
    riskLevel: plan.riskLevel,
    mtf,
    warningsCount: finalWarnings.length,
  });

  return {
    action,
    confidenceScore: clamp(Math.round(candidateFinal), 0, 100),
    signalGrade: grade,
    entryTrigger,
    regime: regimeCtx.regime,
    entryZone: plan.entryZone,
    stopLoss: plan.stopLoss,
    takeProfits: plan.takeProfits,
    riskRewardRatio: plan.riskRewardRatio,
    suggestedLeverage: plan.suggestedLeverage,
    riskLevel: plan.riskLevel,
    invalidationReason: plan.invalidationReason,
    summary,
    reasons,
    warnings: finalWarnings,
    noTradeReasons: [],
    primaryNoTradeReason: null,
    mtfConfirmation: mtf,
    positioning,
    liquiditySweep,
    scoreBreakdown: { ...breakdown, finalScore: candidateFinal },
  };
}

// --------------------------------------------------------------------------
// Sub-score computation
// --------------------------------------------------------------------------

function computeSubScores(
  side: 'LONG' | 'SHORT',
  candles: Candle[],
  price: number,
  regime: RegimeContext,
  input: FuturesSignalInput
): SubScores {
  return {
    trendScore: computeTrendScore(side, regime, price),
    momentumScore: computeMomentumScore(side, candles, input),
    volumeScore: computeVolumeScore(candles),
    structureScore: computeStructureScore(side, candles, price, input),
    riskScore: computeRiskScore(regime),
  };
}

function computeTrendScore(
  side: 'LONG' | 'SHORT',
  regime: RegimeContext,
  price: number
): number {
  const { ema20, ema50, ema200 } = regime;
  if (ema20 == null || ema50 == null || ema200 == null) return 0;

  let score = 50;

  if (side === 'LONG') {
    if (price > ema200) score += 20;
    else score -= 20;
    if (ema20 > ema50) score += 15;
    else score -= 15;
    if (ema50 > ema200) score += 10;
    else score -= 10;
    if (regime.regime === 'BULLISH_TREND') score += 10;
    if (regime.regime === 'BEARISH_TREND') score -= 15;
  } else {
    if (price < ema200) score += 20;
    else score -= 20;
    if (ema20 < ema50) score += 15;
    else score -= 15;
    if (ema50 < ema200) score += 10;
    else score -= 10;
    if (regime.regime === 'BEARISH_TREND') score += 10;
    if (regime.regime === 'BULLISH_TREND') score -= 15;
  }

  return clamp(score, 0, 100);
}

function computeMomentumScore(
  side: 'LONG' | 'SHORT',
  candles: Candle[],
  input: FuturesSignalInput
): number {
  const rsi = input.rsi ?? getRsiStatus(candles);
  const macdSeries = input.macd !== undefined ? null : calculateMACD(candles);
  const macd =
    input.macd !== undefined
      ? input.macd
      : macdSeries && macdSeries.length > 0
        ? macdSeries[macdSeries.length - 1]
        : null;

  let score = 50;

  if (rsi.value != null) {
    if (side === 'LONG') {
      if (rsi.value > 50) score += 15;
      else score -= 15;
      if (rsi.value > 75) score -= 10;
      if (rsi.value < 30) score -= 5;
    } else {
      if (rsi.value < 50) score += 15;
      else score -= 15;
      if (rsi.value < 25) score -= 10;
      if (rsi.value > 70) score -= 5;
    }
  }

  if (macd) {
    if (side === 'LONG') {
      if (macd.histogram > 0) score += 20;
      else score -= 15;
      if (macd.macd > macd.signal) score += 10;
    } else {
      if (macd.histogram < 0) score += 20;
      else score -= 15;
      if (macd.macd < macd.signal) score += 10;
    }
  }

  return clamp(score, 0, 100);
}

function computeVolumeScore(candles: Candle[]): number {
  const sample = candles.slice(-21);
  if (sample.length < 5) return 50;

  const last = sample[sample.length - 1];
  if (!last || last.volume <= 0) return 50;

  const prior = sample.slice(0, -1);
  if (prior.length === 0) return 50;

  const avg = prior.reduce((s, c) => s + c.volume, 0) / prior.length;
  if (avg <= 0) return 50;

  const ratio = last.volume / avg;
  if (ratio >= 2) return 95;
  if (ratio >= 1.5) return 80;
  if (ratio >= 1.2) return 70;
  if (ratio >= 0.9) return 55;
  if (ratio >= 0.6) return 40;
  return 25;
}

function computeStructureScore(
  side: 'LONG' | 'SHORT',
  candles: Candle[],
  price: number,
  input: FuturesSignalInput
): number {
  const sr = input.supportResistance ?? calculateSupportResistance(candles);
  if (sr.support == null || sr.resistance == null) return 50;

  const range = sr.resistance - sr.support;
  if (range <= 0) return 50;

  const position = clamp((price - sr.support) / range, 0, 1);

  let score = 50;
  if (side === 'LONG') {
    if (position < 0.3) score += 25;
    else if (position < 0.5) score += 10;
    else if (position > 0.85) score -= 20;
  } else {
    if (position > 0.7) score += 25;
    else if (position > 0.5) score += 10;
    else if (position < 0.15) score -= 20;
  }

  if (sr.confidence === 'high') score += 10;
  else if (sr.confidence === 'low') score -= 5;

  return clamp(score, 0, 100);
}

function computeRiskScore(regime: RegimeContext): number {
  if (regime.atrPctOfPrice == null) return 40;

  const v = regime.atrPctOfPrice;
  let score = 50;
  if (v < 0.01) score = 85;
  else if (v < 0.02) score = 70;
  else if (v < 0.03) score = 55;
  else if (v < 0.04) score = 40;
  else score = 20;

  if (regime.regime === 'CHOP_HIGH_RISK') score -= 25;
  if (regime.regime === 'RANGE') score -= 10;

  return clamp(score, 0, 100);
}

function weightedScore(s: SubScores): number {
  const v =
    s.trendScore * SCORE_WEIGHTS.trend +
    s.momentumScore * SCORE_WEIGHTS.momentum +
    s.volumeScore * SCORE_WEIGHTS.volume +
    s.structureScore * SCORE_WEIGHTS.structure +
    s.riskScore * SCORE_WEIGHTS.risk;
  return clamp(v, 0, 100);
}

function computeAvgVolume(candles: Candle[]): number | null {
  const sample = candles.slice(-21).slice(0, -1);
  if (sample.length === 0) return null;
  const sum = sample.reduce((s, c) => s + c.volume, 0);
  return sum > 0 ? sum / sample.length : null;
}

// --------------------------------------------------------------------------
// Helpers
// --------------------------------------------------------------------------

function collectReasons(
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

function buildSummary(
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

/** Map a risk-engine WAIT message to a severity. */
function inferRiskWaitSeverity(reason: string): NoTradeReason['severity'] {
  const r = reason.toLowerCase();
  if (r.includes('extreme')) return 'EXTREME_VOLATILITY';
  if (r.includes('risk:reward') || r.includes('rr')) return 'RR_BELOW_MIN';
  if (r.includes('overextended')) return 'OVEREXTENDED';
  return 'RISK_NO_TRADE';
}

interface FinalizeWaitArgs {
  regime: FuturesSignal['regime'];
  summary: string;
  breakdown: FuturesSignalScoreBreakdown;
  reasons: string[];
  warnings: string[];
  confidence: number;
  mtf: FuturesMtfConfirmation;
  liquiditySweep: FuturesLiquiditySweep;
  positioning: FuturesPositioning;
  candidateSide: 'LONG' | 'SHORT';
  candles: Candle[];
  regimeCtx: RegimeContext;
  ranked: NoTradeReason[];
}

function finalizeWait(args: FinalizeWaitArgs): FuturesSignal {
  const { reasons: rankedMessages, primary } = rankNoTradeReasons(args.ranked);
  const grade: FuturesSignalGrade = gradeSignal({
    action: 'WAIT',
    finalScore: args.confidence,
    riskLevel: 'NO_TRADE',
    mtf: args.mtf,
    warningsCount: args.warnings.length,
  });

  return {
    action: 'WAIT',
    confidenceScore: clamp(Math.round(args.confidence), 0, 100),
    signalGrade: grade,
    entryTrigger: 'NO_TRIGGER',
    regime: args.regime,
    entryZone: { min: null, max: null },
    stopLoss: null,
    takeProfits: { tp1: null, tp2: null, tp3: null },
    riskRewardRatio: null,
    suggestedLeverage: { min: 0, max: 0 },
    riskLevel: 'NO_TRADE',
    invalidationReason: primary ?? args.summary,
    summary: args.summary,
    reasons: args.reasons,
    warnings: args.warnings,
    noTradeReasons: rankedMessages,
    primaryNoTradeReason: primary,
    mtfConfirmation: args.mtf,
    positioning: args.positioning,
    liquiditySweep: args.liquiditySweep,
    scoreBreakdown: { ...args.breakdown, finalScore: args.confidence },
  };
}

interface WaitArgs {
  regime: FuturesSignal['regime'];
  reason: string;
  summary: string;
  mtf: FuturesMtfConfirmation;
  liquiditySweep: FuturesLiquiditySweep;
  noTradeReasons: NoTradeReason[];
}

/** Lightweight WAIT path used before any score has been computed. */
function waitSignal(args: WaitArgs): FuturesSignal {
  const ranked = rankNoTradeReasons(args.noTradeReasons);
  return {
    action: 'WAIT',
    confidenceScore: 0,
    signalGrade: 'D',
    entryTrigger: 'NO_TRIGGER',
    regime: args.regime,
    entryZone: { min: null, max: null },
    stopLoss: null,
    takeProfits: { tp1: null, tp2: null, tp3: null },
    riskRewardRatio: null,
    suggestedLeverage: { min: 0, max: 0 },
    riskLevel: 'NO_TRADE',
    invalidationReason: ranked.primary ?? args.reason,
    summary: args.summary,
    reasons: [],
    warnings: [],
    noTradeReasons: ranked.reasons,
    primaryNoTradeReason: ranked.primary,
    mtfConfirmation: args.mtf,
    positioning: {
      fundingRate: null,
      fundingBias: 'UNAVAILABLE',
      openInterestChangePercent: null,
      openInterestBias: 'UNAVAILABLE',
    },
    liquiditySweep: args.liquiditySweep,
    scoreBreakdown: {
      trendScore: 0,
      momentumScore: 0,
      volumeScore: 0,
      structureScore: 0,
      riskScore: 0,
      finalScore: 0,
    },
  };
}

function clamp(v: number, min: number, max: number): number {
  if (!Number.isFinite(v)) return min;
  if (v < min) return min;
  if (v > max) return max;
  return v;
}
