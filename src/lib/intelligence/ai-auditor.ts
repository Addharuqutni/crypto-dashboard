import type {
  AiAuditorInput,
  AiAuditorReport,
} from '@/types/intelligence';

/**
 * Phase 4 — AI Signal Auditor.
 *
 * Two responsibilities:
 *   1. Build a strict, grounded prompt the LLM must follow.
 *   2. Parse the LLM's response and *verify* it. Anything that looks like
 *      price fabrication (a price that was not in the deterministic plan)
 *      flips `detectedPriceFabrication` and the UI must surface a warning.
 *
 * The auditor never produces trade levels of its own. It only explains the
 * deterministic engine's output.
 */

/**
 * System prompt for the auditor. Strict, slot-shaped, in English so the
 * model behaves predictably across providers. Keep it short — long prompts
 * encourage drift on smaller models.
 */
export const AUDITOR_SYSTEM_PROMPT = `You are a TRADING SIGNAL AUDITOR. You DO NOT make trading decisions.
A deterministic risk engine has already decided. Your job is to explain, audit, and challenge.

ABSOLUTE RULES:
- Do NOT invent prices, levels, stop-loss, take-profit, or numbers. Only reference values supplied in the structured context.
- Do NOT recommend leverage. The risk engine sets the ceiling.
- Do NOT convert WAIT into LONG or SHORT.
- Do NOT promise profits, "guaranteed", "must enter", or "risk-free".
- If the deterministic action is WAIT, you must agree with WAIT.
- If data health flags issues, you must surface them.

OUTPUT FORMAT — return strict minified JSON, no Markdown, no prose around it:
{
  "consistent": boolean,
  "consistencyExplanation": string,
  "bestArgumentFor": string,
  "bestArgumentAgainst": string,
  "invalidationCondition": string,
  "shouldWait": boolean,
  "shouldWaitReason": string,
  "caveats": string[]
}

Each string must be 1–3 sentences. No HTML. No emoji. No financial advice phrasing.
Use decision-support language: "setup", "bias", "invalidation", "confirmation", "risk".`;

/** Build the structured user message. JSON-encoded so the LLM can't ignore. */
export function buildAuditorUserPrompt(input: AiAuditorInput): string {
  const compact = compactInput(input);
  return [
    'STRUCTURED CONTEXT (JSON, treat as ground truth):',
    JSON.stringify(compact),
    '',
    'Audit the deterministic signal against this context. Respond with JSON only.',
  ].join('\n');
}

/**
 * Strip the auditor input down to the JSON-safe fields we want the LLM to see.
 * Trims long arrays so the prompt stays under typical 8k-token windows.
 */
function compactInput(input: AiAuditorInput): unknown {
  const sig = input.signal;
  return {
    symbol: input.symbol,
    timeframes: {
      setup: input.setupTimeframe,
      macro: input.macroTimeframe,
      trigger: input.triggerTimeframe,
    },
    riskProfile: input.riskProfile,
    signal: {
      action: sig.action,
      grade: sig.grade,
      confidence: sig.confidence,
      marketRegime: sig.marketRegime,
      tradePermission: sig.tradePermission,
      entryTrigger: sig.entryTrigger,
      entryStatus: sig.entryStatus,
      riskApproval: sig.riskApproval,
      entry: sig.entryZone?.min ?? null,
      stopLoss: sig.stopLoss ?? null,
      tp1: sig.takeProfits?.tp1 ?? null,
      tp2: sig.takeProfits?.tp2 ?? null,
      tp3: sig.takeProfits?.tp3 ?? null,
      riskRewardRatio: sig.riskRewardRatio ?? null,
      reasons: (sig.reasons ?? []).slice(0, 6),
      warnings: (sig.warnings ?? []).slice(0, 6),
      noTradeReasons: (sig.noTradeReasons ?? []).slice(0, 6),
      primaryNoTradeReason: sig.primaryNoTradeReason ?? null,
    },
    dataHealth: sig.dataHealth
      ? {
          ok: sig.dataHealth.ok,
          confidenceCap: sig.dataHealth.confidenceCap,
          reasons: (sig.dataHealth.reasons ?? []).slice(0, 6),
        }
      : null,
    marketContext: {
      btc4hRegime: input.marketContext.btc4hRegime,
      tradePermission: input.marketContext.tradePermission,
      triggerBias: input.marketContext.triggerBias,
      ethCorrelation: input.marketContext.ethCorrelation,
      funding: input.marketContext.funding.regime,
      openInterest: input.marketContext.openInterest.regime,
      volatility: input.marketContext.volatility.regime,
      riskMode: input.marketContext.riskMode,
      reasons: input.marketContext.reasons.slice(0, 4),
      warnings: input.marketContext.warnings.slice(0, 4),
    },
    ranking: {
      score: input.ranking.score,
      grade: input.ranking.grade,
      breakdown: input.ranking.breakdown,
    },
    journalStats: input.journalStats ?? null,
  };
}

/**
 * Parse the model's response. Returns a verified `AiAuditorReport` on success
 * or throws `AiAuditorParseError` with a human-readable reason. The verifier
 * applies guardrails: anything outside the deterministic plan that looks
 * like a fresh price is flagged as `detectedPriceFabrication`.
 */
export class AiAuditorParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AiAuditorParseError';
  }
}

export function parseAuditorResponse(
  raw: string,
  input: AiAuditorInput
): AiAuditorReport {
  const json = extractJsonBlock(raw);
  if (!json) {
    throw new AiAuditorParseError('No JSON object found in auditor response.');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch (err) {
    throw new AiAuditorParseError(
      `Auditor response is not valid JSON: ${(err as Error).message}`
    );
  }

  const report = coerceReport(parsed);

  // Verify guardrails.
  const detectedPriceFabrication = detectFabricatedPrices(report, input);
  const conflict = detectConflict(report, input);

  return {
    ...report,
    detectedPriceFabrication,
    ...(conflict ? { conflict } : {}),
  };
}

/**
 * Strip a fenced code block if present, then locate the first `{`-balanced
 * JSON object. Robust against models that prefix the JSON with prose despite
 * the system prompt.
 */
function extractJsonBlock(raw: string): string | null {
  const trimmed = raw.trim();
  // Fenced code block first.
  const fencedMatch = /```(?:json)?\s*([\s\S]*?)\s*```/i.exec(trimmed);
  const candidate = fencedMatch?.[1] ?? trimmed;
  const start = candidate.indexOf('{');
  if (start < 0) return null;
  let depth = 0;
  for (let i = start; i < candidate.length; i++) {
    const ch = candidate[i];
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return candidate.slice(start, i + 1);
    }
  }
  return null;
}

function coerceReport(parsed: unknown): Omit<AiAuditorReport, 'detectedPriceFabrication' | 'conflict'> {
  if (!parsed || typeof parsed !== 'object') {
    throw new AiAuditorParseError('Auditor JSON is not an object.');
  }
  const obj = parsed as Record<string, unknown>;
  return {
    consistent: typeof obj.consistent === 'boolean' ? obj.consistent : false,
    consistencyExplanation: stringify(obj.consistencyExplanation),
    bestArgumentFor: stringify(obj.bestArgumentFor),
    bestArgumentAgainst: stringify(obj.bestArgumentAgainst),
    invalidationCondition: stringify(obj.invalidationCondition),
    shouldWait: typeof obj.shouldWait === 'boolean' ? obj.shouldWait : false,
    shouldWaitReason: stringify(obj.shouldWaitReason),
    caveats: Array.isArray(obj.caveats)
      ? obj.caveats.map(stringify).filter((s) => s.length > 0).slice(0, 5)
      : [],
  };
}

function stringify(v: unknown): string {
  if (typeof v === 'string') return v.trim();
  if (v == null) return '';
  return String(v).trim();
}

/**
 * Detect price fabrication. Walks every prose field, collects numeric tokens
 * that look like prices (≥ 4 significant digits), and flags any not present
 * in the deterministic plan. Tolerant by design: small numbers like "1.5R"
 * or "ATR 0.84%" are deliberately ignored.
 */
function detectFabricatedPrices(
  report: Omit<AiAuditorReport, 'detectedPriceFabrication' | 'conflict'>,
  input: AiAuditorInput
): boolean {
  const sig = input.signal;
  const allowed = new Set<number>();
  for (const v of [
    sig.entryZone?.min,
    sig.entryZone?.max,
    sig.stopLoss,
    sig.takeProfits?.tp1,
    sig.takeProfits?.tp2,
    sig.takeProfits?.tp3,
  ]) {
    if (v != null && Number.isFinite(v)) allowed.add(Math.round(v));
  }
  if (allowed.size === 0) {
    // No prices in the plan ⇒ any price-shaped number is fabrication.
  }

  const fields: string[] = [
    report.consistencyExplanation,
    report.bestArgumentFor,
    report.bestArgumentAgainst,
    report.invalidationCondition,
    report.shouldWaitReason,
    ...report.caveats,
  ];

  for (const text of fields) {
    if (!text) continue;
    const matches = text.match(/\$?\s*\d{2,}[,\d]*(?:\.\d+)?/g);
    if (!matches) continue;
    for (const m of matches) {
      const num = Number.parseFloat(m.replace(/[$,\s]/g, ''));
      if (!Number.isFinite(num)) continue;
      // Ignore obvious non-price numbers (percentages, R-multiples).
      if (num < 100) continue;
      // Allow ±0.5% deviation from any known plan price (rounding).
      let close = false;
      for (const allowedPrice of allowed) {
        if (Math.abs(num - allowedPrice) / allowedPrice <= 0.005) {
          close = true;
          break;
        }
      }
      if (!close) return true;
    }
  }
  return false;
}

/**
 * Detect a conflict between the AI's verdict and the deterministic action.
 * The deterministic action ALWAYS wins; this just records that the auditor
 * disagreed so the UI can show a warning.
 */
function detectConflict(
  report: Omit<AiAuditorReport, 'detectedPriceFabrication' | 'conflict'>,
  input: AiAuditorInput
): AiAuditorReport['conflict'] | null {
  const detAction = input.signal.action;
  // The auditor's nominal action is implicit; we infer it from `shouldWait`
  // and the consistency flag so a tampering model still gets caught.
  if (detAction === 'WAIT' && report.shouldWait === false) {
    return {
      aiAction: 'LONG',
      deterministicAction: 'WAIT',
      note:
        'AI suggests acting while the deterministic engine emitted WAIT. The deterministic decision wins.',
    };
  }
  if (detAction !== 'WAIT' && report.shouldWait === true && report.consistent === false) {
    return {
      aiAction: 'WAIT',
      deterministicAction: detAction,
      note:
        'AI thinks the trader should wait while the deterministic engine has approved a setup. The deterministic decision still applies; review the AI’s rationale.',
    };
  }
  return null;
}
