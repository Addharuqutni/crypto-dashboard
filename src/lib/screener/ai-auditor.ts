/**
 * Screener AI Auditor.
 *
 * Strict guardrails (must never be violated):
 *   - AI must NOT determine LONG/SHORT/WAIT.
 *   - AI must NOT invent entry, stop loss, take profit, leverage, liquidation,
 *     or any price level.
 *   - AI must NOT override the deterministic signal engine.
 *   - AI may only audit and explain deterministic results that already exist.
 *   - If data is stale, conflicting, or insufficient, AI prefers WAIT_PREFERRED.
 *
 * Behaviour:
 *   - optional and fail-soft (no AI config = no audit, no error)
 *   - cached by (symbol, action, candleCloseTime) to avoid redundant cost
 *   - schema-validates AI output and rejects malformed responses
 */

import type { AiConfig } from '@/types/ai';
import { sendChatCompletion, AiClientError } from '@/lib/ai/ai-client';
import type { RankedScreenerResult } from './types';

export type AuditVerdict = 'VALID' | 'WEAK' | 'WAIT_PREFERRED';

export interface ScreenerAuditResult {
  symbol: string;
  verdict: AuditVerdict;
  summary: string;
  mainRisk: string;
  nextStep: string;
  caveats: string[];
  generatedAt: number;
}

export interface AuditCacheKey {
  symbol: string;
  action: string;
  candleCloseTime: number;
}

/**
 * The strict system prompt — encodes the no-fabrication, no-override
 * guardrails. Tested verbatim in `ai-auditor.test.ts`.
 */
export const SCREENER_AUDITOR_SYSTEM_PROMPT = `You are a deterministic-engine auditor for a crypto futures screener.

CORE RULES (NEVER VIOLATE):
1. You DO NOT decide LONG/SHORT/WAIT. The deterministic signal engine has already decided.
2. You DO NOT invent entry, stop loss, take profit, leverage, liquidation, or any price levels.
3. You DO NOT override the signal engine's decision.
4. You ONLY audit and explain the data you are given.
5. If the data is stale, conflicting, or insufficient, set verdict to WAIT_PREFERRED.
6. Confidence is setup quality, not win probability.
7. This is educational decision-support, not financial advice.

INPUT: a JSON object describing one screener candidate (symbol, action, confidence, grade, dataHealth, regime, permission, MTF alignment, warnings, reasons).

OUTPUT: respond ONLY with a single JSON object matching this exact schema:
{
  "symbol": string,
  "verdict": "VALID" | "WEAK" | "WAIT_PREFERRED",
  "summary": string (max 200 chars),
  "mainRisk": string (max 160 chars),
  "nextStep": string (max 160 chars),
  "caveats": string[] (max 4 items, each max 120 chars)
}

VERDICT GUIDANCE:
- VALID: deterministic setup is well-aligned (high confidence, healthy data, MTF agreement, no major warnings).
- WEAK: setup is technically eligible but has notable risks (mediocre alignment, partial warnings, edge-case grade).
- WAIT_PREFERRED: setup is weak enough that waiting is preferable (stale data, regime conflict, late entry, low alignment, or any data-health concern).

You MUST NOT:
- Recommend specific entry/SL/TP/leverage values.
- Recommend new actions different from the engine's action.
- Speculate on price targets, "next move", or probabilities.
- Reference data not provided to you.

Respond with ONLY the JSON object. No prose before or after.`;

/**
 * Build the user message containing only deterministic signal data.
 * Excludes raw secrets, environment data, and any fields the AI must not see.
 */
export function buildAuditUserMessage(result: RankedScreenerResult): string {
  return JSON.stringify({
    symbol: result.symbol,
    action: result.action,
    confidence: result.confidence,
    grade: result.grade,
    rankingScore: result.rankingScore,
    marketRegime: result.marketRegime,
    tradePermission: result.tradePermission,
    mtfAlignmentScore: result.mtfAlignmentScore,
    riskReward: result.riskReward,
    dataHealth: {
      ok: result.dataHealth.ok,
      reasons: result.dataHealth.reasons,
      confidenceCap: result.dataHealth.confidenceCap,
    },
    reasons: result.reasons.slice(0, 5),
    warnings: result.warnings.slice(0, 5),
    noTradeReasons: result.noTradeReasons.slice(0, 5),
  }, null, 2);
}

/**
 * Validate AI output against the audit schema. Returns null when invalid.
 */
export function parseAuditResult(raw: string, expectedSymbol: string): ScreenerAuditResult | null {
  let json: unknown;
  try {
    // Strip code fences if the model added them despite instructions.
    const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
    json = JSON.parse(cleaned);
  } catch {
    return null;
  }

  if (typeof json !== 'object' || json === null) return null;
  const o = json as Record<string, unknown>;

  if (typeof o.symbol !== 'string') return null;
  if (o.symbol !== expectedSymbol) return null;
  if (o.verdict !== 'VALID' && o.verdict !== 'WEAK' && o.verdict !== 'WAIT_PREFERRED') return null;
  if (typeof o.summary !== 'string' || o.summary.length === 0 || o.summary.length > 240) return null;
  if (typeof o.mainRisk !== 'string' || o.mainRisk.length === 0 || o.mainRisk.length > 200) return null;
  if (typeof o.nextStep !== 'string' || o.nextStep.length === 0 || o.nextStep.length > 200) return null;
  if (!Array.isArray(o.caveats)) return null;
  if (o.caveats.length > 6) return null;
  if (!o.caveats.every((c) => typeof c === 'string' && c.length <= 160)) return null;

  return {
    symbol: o.symbol,
    verdict: o.verdict,
    summary: o.summary,
    mainRisk: o.mainRisk,
    nextStep: o.nextStep,
    caveats: o.caveats as string[],
    generatedAt: Date.now(),
  };
}

/**
 * Audit a single ranked result. Returns null when:
 *   - AI config is missing/empty (fail-soft)
 *   - AI request fails (fail-soft)
 *   - AI output fails schema validation (rejected)
 */
export async function auditRankedResult(
  result: RankedScreenerResult,
  config: AiConfig | null
): Promise<ScreenerAuditResult | null> {
  if (!config || !config.apiKey || !config.baseUrl || !config.model) {
    return null;
  }

  try {
    const content = await sendChatCompletion(
      config,
      [
        { role: 'system', content: SCREENER_AUDITOR_SYSTEM_PROMPT },
        { role: 'user', content: buildAuditUserMessage(result) },
      ],
      { temperature: 0.2, maxTokens: 600 }
    );

    return parseAuditResult(content, result.symbol);
  } catch (err) {
    if (err instanceof AiClientError) {
      console.warn('[screener.ai-auditor] AI request failed:', err.message);
    } else {
      console.warn('[screener.ai-auditor] AI request failed with unknown error');
    }
    return null;
  }
}

/**
 * Lightweight in-memory cache keyed by (symbol, action, candleCloseTime).
 * Identical inputs reuse the same audit. Caller is responsible for clearing
 * the cache between long-running cycles if needed.
 */
export class AuditCache {
  private readonly map = new Map<string, ScreenerAuditResult>();

  private key(k: AuditCacheKey): string {
    return `${k.symbol}:${k.action}:${k.candleCloseTime}`;
  }

  get(k: AuditCacheKey): ScreenerAuditResult | null {
    return this.map.get(this.key(k)) ?? null;
  }

  set(k: AuditCacheKey, value: ScreenerAuditResult): void {
    this.map.set(this.key(k), value);
  }

  clear(): void {
    this.map.clear();
  }
}

/**
 * Audit a batch of top candidates with caching. Skipped/null results are
 * never thrown — they simply mean "no audit available". Callers must treat
 * the absence of an audit as the default UX.
 */
export async function auditTopCandidates(
  results: RankedScreenerResult[],
  config: AiConfig | null,
  options?: { topN?: number; cache?: AuditCache }
): Promise<Map<string, ScreenerAuditResult>> {
  const audits = new Map<string, ScreenerAuditResult>();
  if (!config) return audits;

  const cache = options?.cache;
  const topN = options?.topN ?? 3;
  const candidates = results.filter((r) => r.alertEligible).slice(0, topN);

  for (const candidate of candidates) {
    const cacheKey: AuditCacheKey = {
      symbol: candidate.symbol,
      action: candidate.action,
      candleCloseTime: candidate.candleCloseTime ?? 0,
    };

    const cached = cache?.get(cacheKey);
    if (cached) {
      audits.set(candidate.symbol, cached);
      continue;
    }

    const audit = await auditRankedResult(candidate, config);
    if (audit) {
      audits.set(candidate.symbol, audit);
      cache?.set(cacheKey, audit);
    }
  }

  return audits;
}
