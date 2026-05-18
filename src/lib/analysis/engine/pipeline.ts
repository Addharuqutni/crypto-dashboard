import type {
  FuturesMarketRegimeId,
  FuturesPositioning,
  FuturesSignal,
  FuturesSignalAction,
  FuturesSignalConfig,
  FuturesSignalInput,
  FuturesSignalScoreBreakdown,
} from '@/types/futures-signal';
import { DEFAULT_FUTURES_SIGNAL_CONFIG } from '@/types/futures-signal';
import { detectRegime } from '../regime-detector';
import { buildRiskPlan } from '../risk-engine';
import { buildMtfConfirmation } from '../multi-timeframe-engine';
import { applyFundingFilter } from '../funding-rate-filter';
import { applyOpenInterestFilter } from '../open-interest-filter';
import { detectLiquiditySweep } from '../liquidity-sweep-detector';
import { classifyEntryTrigger } from '../entry-trigger-classifier';
import { gradeSignal } from '../signal-grade';
import { type NoTradeReason } from '../no-trade-rank';
import { evaluateDataHealth } from '../data-health-gate';
import {
  checkPermission,
  deriveTradePermission,
  toCoarseGrade,
  toMarketRegimeId,
} from '../regime-permission';
import { getRsiStatus } from '@/lib/indicators/rsi';
import { calculateSupportResistance } from '@/lib/indicators/support-resistance';
import { evaluateForecastAgreement } from '../forecast-agreement';
import { evaluateLateEntryGuard } from '../late-entry-guard';

import { clamp } from './utils';
import { computeSubScores, weightedScore, computeAvgVolume } from './scoring';
import { collectReasons, buildSummary, inferRiskWaitSeverity } from './explain';
import {
  finalizeWait,
  waitSignal,
  emptyMtf,
  emptySweep,
  type GateWaitArgs,
} from './wait-signal';

/**
 * Futures Signal Engine V2 — Pipeline.
 *
 * Pipeline:
 *   1. Data health gate (strictest).
 *   2. Regime detection (MTF setup TF).
 *   3. Multi-timeframe confirmation (macro + setup + trigger).
 *   4. Liquidity sweep detection (setup TF).
 *   5. Sub-score computation (trend/momentum/volume/structure/risk).
 *   6. Funding/OI filters (confirmation only — adjust score, add warnings).
 *   7. 4H Trade Permission Gate.
 *   8. Hard guards: overextension, MTF severe conflict, alignment floor.
 *   9. Score gates.
 *  10. Regime gate: only trade in the direction the regime supports.
 *  11. Risk engine: stop, TPs, RR floor, leverage. Authoritative WAIT.
 *  12. Entry trigger classification.
 *  13. Late-entry guard.
 *  14. Forecast agreement (Kronos).
 *  15. Final assembly.
 *
 * Risk override beats every other signal. Confirmation filters never CREATE
 * trades — only weaken or strengthen existing ones. WAIT is the safe default.
 */
export function generateFuturesSignal(
  input: FuturesSignalInput,
  config: FuturesSignalConfig = DEFAULT_FUTURES_SIGNAL_CONFIG
): FuturesSignal {
  const { candles } = input;

  // --- 0. Data Health Gate. ---
  const dataHealth = evaluateDataHealth(
    {
      symbol: input.symbol,
      setupTimeframe: input.timeframe,
      setupCandles: candles,
      ...(input.macroCandles ? { macroCandles: input.macroCandles } : {}),
      ...(input.triggerCandles ? { triggerCandles: input.triggerCandles } : {}),
      fundingRate: input.fundingRate ?? null,
      fundingRateUpdatedAtMs: input.fundingRateUpdatedAtMs ?? null,
      openInterestChangePercent: input.openInterestChangePercent ?? null,
      openInterestUpdatedAtMs: input.openInterestUpdatedAtMs ?? null,
      ...(input.nowMs != null ? { nowMs: input.nowMs } : {}),
    },
    config
  );

  // --- 4H macro regime + trade permission. ---
  const macroRegimeCtx = input.macroCandles && input.macroCandles.length > 0
    ? detectRegime(input.macroCandles, config)
    : null;
  const macroRegimeId: FuturesMarketRegimeId = macroRegimeCtx
    ? toMarketRegimeId(macroRegimeCtx.regime, {
        isVolatile:
          macroRegimeCtx.atrPctOfPrice != null &&
          macroRegimeCtx.atrPctOfPrice >= config.extremeVolatilityRatio,
      })
    : 'unknown';
  const tradePermission = deriveTradePermission(macroRegimeId);

  if (!dataHealth.ok) {
    const reasons: NoTradeReason[] = dataHealth.reasons.map((message) => ({
      severity: 'INSUFFICIENT_DATA' as const,
      message,
    }));
    if (reasons.length === 0) {
      reasons.push({
        severity: 'INSUFFICIENT_DATA',
        message: 'Data health checks failed.',
      });
    }
    return waitSignal({
      regime: 'INSUFFICIENT_DATA',
      reason: reasons[0]?.message ?? 'Data health checks failed.',
      summary: 'Data health checks failed. Stand aside until inputs recover.',
      mtf: emptyMtf(),
      liquiditySweep: emptySweep(),
      noTradeReasons: reasons,
      dataHealth,
      marketRegime: macroRegimeId,
      tradePermission,
      entryStatus: 'invalid',
      riskApproval: 'not_applicable',
    });
  }

  // --- 1. Regime detection (setup TF). ---
  const regimeCtx = detectRegime(candles, config);

  // --- 2. MTF confirmation. ---
  const mtf = buildMtfConfirmation(
    {
      setupCandles: candles,
      ...(input.macroCandles ? { macroCandles: input.macroCandles } : {}),
      ...(input.triggerCandles ? { triggerCandles: input.triggerCandles } : {}),
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
      dataHealth,
      marketRegime: macroRegimeId,
      tradePermission,
      entryStatus: 'invalid',
      riskApproval: 'not_applicable',
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
      dataHealth,
      marketRegime: macroRegimeId,
      tradePermission,
      entryStatus: 'invalid',
      riskApproval: 'not_applicable',
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

  // --- 5. Funding + OI filters. ---
  const fundingFilter = applyFundingFilter(
    candidateSide,
    input.fundingRate ?? null,
    config
  );
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

  // Closure that fills in the strict-pipeline context every gate needs.
  const wait = (args: GateWaitArgs): FuturesSignal =>
    finalizeWait({
      ...args,
      dataHealth,
      marketRegime: macroRegimeId,
      tradePermission,
    });

  // --- 5b. 4H Trade Permission Gate. ---
  const permissionDenial = checkPermission(candidateSide, tradePermission);
  if (permissionDenial) {
    noTradeReasons.push({
      severity: 'MTF_CONFLICT',
      message: permissionDenial,
    });
    return wait({
      regime: regimeCtx.regime,
      summary: permissionDenial,
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

  // --- 6. Hard guard: overextension. ---
  if (regimeCtx.ema20 != null && regimeCtx.ema20 > 0) {
    const distancePct = Math.abs(price - regimeCtx.ema20) / regimeCtx.ema20;
    if (distancePct >= config.overextensionRatio) {
      warnings.push('Price is overextended from EMA20. Avoid chasing.');
      noTradeReasons.push({
        severity: 'OVEREXTENDED',
        message: `Entry is ${(distancePct * 100).toFixed(2)}% away from EMA20 — overextended.`,
      });
      return wait({
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
        riskApproval: 'fail',
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
    return wait({
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
    return wait({
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
    return wait({
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
    return wait({
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
    return wait({
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
    return wait({
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
      riskApproval: 'fail',
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
    return wait({
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
      riskApproval: 'fail',
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

  if (entryTrigger === 'NO_TRIGGER') {
    noTradeReasons.push({
      severity: 'NO_TRIGGER',
      message: 'No clean entry trigger detected. Wait for breakout, retest, or sweep reversal.',
    });
    return wait({
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
      riskApproval: 'pass',
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

  // --- 13a. Late-entry guard. ---
  const setupRsi = (input.rsi ?? getRsiStatus(candles)).value ?? null;
  const triggerRsi =
    input.triggerCandles && input.triggerCandles.length > 0
      ? (getRsiStatus(input.triggerCandles).value ?? null)
      : null;
  const ema20 = regimeCtx.ema20;
  const distanceFromEma20Pct =
    ema20 != null && ema20 > 0 ? (Math.abs(price - ema20) / ema20) * 100 : null;
  const sr = input.supportResistance ?? calculateSupportResistance(candles);
  const proximityPct = 0.0075; // 0.75% — "near" structural levels
  const nearSupport =
    sr.support != null && Math.abs(price - sr.support) / price <= proximityPct;
  const nearResistance =
    sr.resistance != null && Math.abs(price - sr.resistance) / price <= proximityPct;
  const recentBarsForVol = candles.slice(-Math.min(candles.length, 21));
  const lastBarVol = lastCandle.volume ?? 0;
  const priorBarsVol = recentBarsForVol.slice(0, -1);
  const avgPriorVol =
    priorBarsVol.length > 0
      ? priorBarsVol.reduce((s, c) => s + c.volume, 0) / priorBarsVol.length
      : 0;
  const volumeIsWeak = avgPriorVol > 0 ? lastBarVol < avgPriorVol * 0.7 : false;

  const lateEntry = evaluateLateEntryGuard({
    side: candidateSide,
    macroRegime: macroRegimeId,
    setupRsi,
    triggerRsi,
    distanceFromEma20Pct,
    nearSupport,
    nearResistance,
    volumeIsWeak,
  });

  if (lateEntry.blocked) {
    finalWarnings.push(`Original ${candidateSide} bias preserved, but entry blocked: ${lateEntry.reason}`);
    noTradeReasons.push({
      severity: 'OVEREXTENDED',
      message: lateEntry.reason ?? 'Late entry blocked.',
    });
    return {
      ...wait({
        regime: regimeCtx.regime,
        summary: lateEntry.reason ?? 'Late entry blocked. Wait for a better location.',
        breakdown,
        reasons,
        warnings: finalWarnings,
        confidence: candidateFinal,
        mtf,
        liquiditySweep,
        positioning,
        candidateSide,
        candles,
        regimeCtx,
        ranked: noTradeReasons,
        riskApproval: 'pass',
      }),
      lateEntryBlocked: true,
      lateEntryReason: lateEntry.reason,
    };
  }

  // --- 13b. Forecast agreement (Kronos). ---
  const forecastAgreement = evaluateForecastAgreement({
    action,
    grade: toCoarseGrade(grade),
    forecast: input.forecast ?? null,
  });
  const forecastWarnings = forecastAgreement.warning ? [forecastAgreement.warning] : [];
  const adjustedScore = clamp(
    candidateFinal + forecastAgreement.confidenceAdjustment,
    0,
    100
  );

  if (
    forecastAgreement.alignment === 'conflicting' &&
    adjustedScore < config.scoreActionable
  ) {
    noTradeReasons.push({
      severity: 'MTF_CONFLICT',
      message: 'Kronos forecast conflicts with deterministic setup.',
    });
    return {
      ...wait({
        regime: regimeCtx.regime,
        summary: 'Forecast conflicts with deterministic signal. Wait for confirmation.',
        breakdown: { ...breakdown, finalScore: adjustedScore },
        reasons,
        warnings: [...finalWarnings, ...forecastWarnings],
        confidence: adjustedScore,
        mtf,
        liquiditySweep,
        positioning,
        candidateSide,
        candles,
        regimeCtx,
        ranked: noTradeReasons,
        riskApproval: 'pass',
      }),
      forecastAlignment: forecastAgreement.alignment,
      ...(input.forecast ? { forecastDirection: input.forecast.direction } : {}),
      forecastConfidenceAdjustment: forecastAgreement.confidenceAdjustment,
      forecastWarnings,
      forecastUsedInDecision: forecastAgreement.usedInDecision,
    };
  }

  // Apply the data-health confidence cap.
  const cappedConfidence = Math.min(adjustedScore, dataHealth.confidenceCap);
  const confidenceOut = clamp(Math.round(cappedConfidence), 0, 100);

  return {
    action,
    confidenceScore: confidenceOut,
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
    warnings: [...finalWarnings, ...forecastWarnings],
    noTradeReasons: [],
    primaryNoTradeReason: null,
    mtfConfirmation: mtf,
    positioning,
    liquiditySweep,
    scoreBreakdown: { ...breakdown, finalScore: adjustedScore },

    // Strict pipeline outputs.
    confidence: confidenceOut,
    grade: toCoarseGrade(grade),
    marketRegime: macroRegimeId,
    tradePermission,
    dataHealth,
    entryStatus: 'triggered',
    riskApproval: 'pass',
    invalidation: plan.invalidationReason,
    reason: reasons,

    // Phase 5 forecast metadata.
    forecastAlignment: forecastAgreement.alignment,
    ...(input.forecast ? { forecastDirection: input.forecast.direction } : {}),
    forecastConfidenceAdjustment: forecastAgreement.confidenceAdjustment,
    forecastWarnings,
    forecastUsedInDecision: forecastAgreement.usedInDecision,

    // Phase 5 late-entry metadata.
    lateEntryBlocked: false,
    lateEntryReason: null,
  };
}
