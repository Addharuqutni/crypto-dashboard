import type {
  FuturesMtfConfirmation,
  FuturesRiskLevel,
  FuturesSignalAction,
  FuturesSignalGrade,
} from '@/types/futures-signal';

/**
 * Signal Grade.
 *
 * Maps the engine's outputs into a quick-read letter grade. Strict rules:
 *
 *   - NO_TRADE risk            => D (always)
 *   - WAIT action              => D or C only
 *   - Major MTF conflict       => D
 *   - score >= 85, MTF aligned, risk LOW/MEDIUM, no major warnings => A+
 *   - score >= 75, risk acceptable, no hard conflicts              => A
 *   - score >= 65, valid but conflict/needs confirmation           => B
 *   - score >= 50, weak setup                                      => C
 */

export interface GradeInputs {
  action: FuturesSignalAction;
  finalScore: number;
  riskLevel: FuturesRiskLevel;
  mtf: FuturesMtfConfirmation;
  warningsCount: number;
}

export function gradeSignal(inputs: GradeInputs): FuturesSignalGrade {
  // Hard floor: any NO_TRADE risk is a D.
  if (inputs.riskLevel === 'NO_TRADE') return 'D';

  // Major MTF conflict (direct macro vs setup contradiction) is a D.
  if (
    (inputs.mtf.macroBias === 'BULLISH' && inputs.mtf.setupBias === 'BEARISH') ||
    (inputs.mtf.macroBias === 'BEARISH' && inputs.mtf.setupBias === 'BULLISH')
  ) {
    return 'D';
  }

  // WAIT action: D for very weak score, C for borderline.
  if (inputs.action === 'WAIT') {
    if (inputs.finalScore >= 50) return 'C';
    return 'D';
  }

  const score = inputs.finalScore;
  const riskOk = inputs.riskLevel === 'LOW' || inputs.riskLevel === 'MEDIUM';
  const aligned = inputs.mtf.alignmentScore >= 70;

  if (score >= 85 && riskOk && aligned && inputs.warningsCount === 0) return 'A+';
  if (score >= 75 && riskOk) return 'A';
  if (score >= 65) return 'B';
  if (score >= 50) return 'C';
  return 'D';
}
